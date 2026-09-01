'use client';

import { sha256 } from '@noble/hashes/sha2.js';

export type ApiClient = {
  request: (path: string, options?: RequestInit) => Promise<Response>;
};

export type DirectUploadFile = {
  file: File;
  component?: 'shp' | 'shx' | 'dbf' | 'prj' | 'cpg';
};

export type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
};

export type UploadDatasetOptions = {
  idempotencyKey: string;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

type CreatedDataset = { dataset: { id: string } };

type CreatedFile = {
  file: {
    id: string;
    multipart: boolean;
    uploadUrl: string | null;
    partSizeBytes: number | null;
  };
};

type UploadPart = { partNumber: number; etag: string };

const defaultPartSizeBytes = 16 * 1024 * 1024;

const partBatchSize = 20;

const maxConcurrentUploads = 4;

const maxAttempts = 3;

export const hashFile = async (file: File): Promise<string> => {
  const hash = sha256.create();

  for (let offset = 0; offset < file.size; offset += defaultPartSizeBytes) {
    hash.update(
      new Uint8Array(await file.slice(offset, offset + defaultPartSizeBytes).arrayBuffer())
    );
  }

  return Array.from(hash.digest())
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

export const uploadDataset = async (
  api: ApiClient,
  analysisId: string,
  kind: 'occurrence' | 'predictor',
  format: 'csv' | 'xlsx' | 'geojson' | 'shapefile' | 'geotiff',
  files: DirectUploadFile[],
  options: UploadDatasetOptions
): Promise<string> => {
  const created = await requestJson<CreatedDataset>(
    api,
    `/v1/analyses/${analysisId}/upload-datasets`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': options.idempotencyKey,
      },
      body: JSON.stringify({ kind, format }),
      signal: options.signal,
    }
  );
  const datasetId = created.dataset.id;
  const progress = new Map<File, number>();
  const totalBytes = files.reduce((total, entry) => total + entry.file.size, 0);

  const reportProgress = (): void => {
    options.onProgress?.({
      loadedBytes: Array.from(progress.values()).reduce((total, value) => total + value, 0),
      totalBytes,
    });
  };

  try {
    const uploads = await Promise.all(
      files.map(async ({ file, component }) => {
        const digest = await hashFile(file);
        const createdFile = await requestJson<CreatedFile>(
          api,
          `/v1/analyses/${analysisId}/upload-datasets/${datasetId}/files`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              originalName: file.name,
              size: file.size,
              sha256: digest,
              contentType: file.type || undefined,
              component,
            }),
            signal: options.signal,
          }
        );
        return { file, upload: createdFile.file };
      })
    );

    for (const { file, upload } of uploads) {
      const parts = await uploadFile(
        api,
        analysisId,
        datasetId,
        file,
        upload,
        options.signal,
        (loaded) => {
          progress.set(file, loaded);
          reportProgress();
        }
      );
      await requestNoContent(
        api,
        `/v1/analyses/${analysisId}/upload-datasets/${datasetId}/files/${upload.id}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parts }),
          signal: options.signal,
        }
      );
    }

    await requestJson(api, `/v1/analyses/${analysisId}/upload-datasets/${datasetId}/complete`, {
      method: 'POST',
      signal: options.signal,
    });
    return datasetId;
  } catch (error) {
    await api
      .request(`/v1/analyses/${analysisId}/upload-datasets/${datasetId}`, {
        method: 'DELETE',
      })
      .catch(() => undefined);
    throw error;
  }
};

const uploadFile = async (
  api: ApiClient,
  analysisId: string,
  datasetId: string,
  file: File,
  upload: CreatedFile['file'],
  signal: AbortSignal | undefined,
  onProgress: (loadedBytes: number) => void
): Promise<UploadPart[]> => {
  if (!upload.multipart) {
    if (!upload.uploadUrl) {
      throw new Error('Upload initialization did not return a URL.');
    }

    await putWithRetry(upload.uploadUrl, file, file.type, signal, onProgress, async () => {
      const refreshed = await requestJson<{ uploadUrl: string }>(
        api,
        `/v1/analyses/${analysisId}/upload-datasets/${datasetId}/files/${upload.id}/url`,
        { method: 'POST', signal }
      );
      return refreshed.uploadUrl;
    });
    return [];
  }

  const partSize = upload.partSizeBytes ?? defaultPartSizeBytes;
  const partCount = Math.ceil(file.size / partSize);
  const completedParts: UploadPart[] = [];
  let loadedBytes = 0;

  for (let start = 1; start <= partCount; start += partBatchSize) {
    const partNumbers = Array.from(
      { length: Math.min(partBatchSize, partCount - start + 1) },
      (_, index) => start + index
    );
    const signed = await requestJson<{ parts: Array<{ partNumber: number; url: string }> }>(
      api,
      `/v1/analyses/${analysisId}/upload-datasets/${datasetId}/files/${upload.id}/parts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partNumbers }),
        signal,
      }
    );
    const currentBytes = new Map<number, number>();
    const batch: UploadPart[] = [];
    await runWithConcurrency(signed.parts, maxConcurrentUploads, async (part) => {
      const partStart = (part.partNumber - 1) * partSize;
      const body = file.slice(partStart, Math.min(partStart + partSize, file.size));
      const etag = await putWithRetry(
        part.url,
        body,
        undefined,
        signal,
        (uploaded) => {
          currentBytes.set(part.partNumber, uploaded);
          onProgress(
            loadedBytes +
              Array.from(currentBytes.values()).reduce((total, value) => total + value, 0)
          );
        },
        async () => {
          const refreshed = await requestJson<{
            parts: Array<{ partNumber: number; url: string }>;
          }>(
            api,
            `/v1/analyses/${analysisId}/upload-datasets/${datasetId}/files/${upload.id}/parts`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ partNumbers: [part.partNumber] }),
              signal,
            }
          );
          return refreshed.parts[0].url;
        }
      );
      batch.push({ partNumber: part.partNumber, etag });
    });
    completedParts.push(...batch);
    loadedBytes += batch.reduce(
      (total, part) => total + Math.min(partSize, file.size - (part.partNumber - 1) * partSize),
      0
    );
    onProgress(loadedBytes);
  }

  return completedParts.sort((left, right) => left.partNumber - right.partNumber);
};

const putWithRetry = async (
  url: string,
  body: Blob,
  contentType: string | undefined,
  signal: AbortSignal | undefined,
  onProgress: (loadedBytes: number) => void,
  refreshUrl?: () => Promise<string>
): Promise<string> => {
  let lastError: Error | undefined;
  let activeUrl = url;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await putWithXhr(activeUrl, body, contentType, signal, onProgress);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('The upload failed.');
      if (signal?.aborted || attempt === maxAttempts) {
        break;
      }

      if (attempt === 1 && refreshUrl) {
        activeUrl = await refreshUrl();
      }

      await delay(2 ** (attempt - 1) * 250 + Math.random() * 250, signal);
    }
  }

  throw lastError ?? new Error('The upload failed.');
};

const putWithXhr = async (
  url: string,
  body: Blob,
  contentType: string | undefined,
  signal: AbortSignal | undefined,
  onProgress: (loadedBytes: number) => void
): Promise<string> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = (): void => request.abort();
    signal?.addEventListener('abort', abort, { once: true });
    request.open('PUT', url);
    if (contentType) {
      request.setRequestHeader('Content-Type', contentType);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };
    request.onload = () => {
      signal?.removeEventListener('abort', abort);
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader('ETag');
        if (etag) {
          resolve(etag);
        } else {
          reject(new Error('Storage did not return an ETag.'));
        }
        return;
      }
      reject(new Error(`Storage upload failed with status ${request.status}.`));
    };
    request.onerror = () => reject(new Error('Storage upload failed.'));
    request.onabort = () => reject(new DOMException('The upload was cancelled.', 'AbortError'));
    request.send(body);
  });

const requestJson = async <T>(api: ApiClient, path: string, options: RequestInit): Promise<T> => {
  const response = await api.request(path, options);
  if (!response.ok) {
    throw new Error('The API request failed.');
  }

  return response.json() as Promise<T>;
};

const requestNoContent = async (
  api: ApiClient,
  path: string,
  options: RequestInit
): Promise<void> => {
  const response = await api.request(path, options);
  if (!response.ok) {
    throw new Error('The API request failed.');
  }
};

const runWithConcurrency = async <T>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<void>
): Promise<void> => {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      await operation(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
};

const delay = async (milliseconds: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('The upload was cancelled.', 'AbortError'));
      },
      { once: true }
    );
  });
