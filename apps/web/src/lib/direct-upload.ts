'use client';

import { sha256 } from '@noble/hashes/sha2.js';

type ApiClient = { request: (path: string, options?: RequestInit) => Promise<Response> };

type UploadFileResult = { uploadId: string; url: string; multipart: boolean };

type DatasetResponse = { datasetId: string; files: UploadFileResult[] };

const partSize = 16 * 1024 * 1024;

export const hashFile = async (file: File): Promise<string> => {
  const hash = sha256.create();

  for (let offset = 0; offset < file.size; offset += partSize) {
    hash.update(new Uint8Array(await file.slice(offset, offset + partSize).arrayBuffer()));
  }

  return Array.from(hash.digest())
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

export const uploadDataset = async (
  api: ApiClient,
  analysisId: string,
  kind: 'occurrence' | 'predictor',
  format: 'csv' | 'xlsx' | 'geojson' | 'geotiff',
  file: File
): Promise<void> => {
  const digest = await hashFile(file);
  const response = await api.request(`/v1/analyses/${analysisId}/upload-datasets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind,
      format,
      files: [
        {
          originalName: file.name,
          size: file.size,
          sha256: digest,
          contentType: file.type || undefined,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Unable to initialize the upload.');
  }

  const dataset = (await response.json()) as DatasetResponse;
  const upload = dataset.files[0];
  const parts: Array<{ partNumber: number; etag: string }> = [];
  if (upload.multipart) {
    const partCount = Math.ceil(file.size / partSize);
    const urls = await api.request(
      `/v1/analyses/${analysisId}/upload-datasets/${upload.uploadId}/parts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partNumbers: Array.from({ length: partCount }, (_, index) => index + 1),
        }),
      }
    );
    const response = (await urls.json()) as { parts: Array<{ partNumber: number; url: string }> };
    for (const part of response.parts) {
      const start = (part.partNumber - 1) * partSize;
      const result = await fetch(part.url, {
        method: 'PUT',
        body: file.slice(start, start + partSize),
      });
      const etag = result.headers.get('etag');
      if (!result.ok || !etag) {
        throw new Error('The file upload failed.');
      }

      parts.push({ partNumber: part.partNumber, etag });
    }
  } else {
    const result = await fetch(upload.url, {
      method: 'PUT',
      headers: file.type ? { 'Content-Type': file.type } : undefined,
      body: file,
    });
    if (!result.ok) {
      throw new Error('The file upload failed.');
    }
  }

  const complete = await api.request(
    `/v1/analyses/${analysisId}/upload-datasets/${upload.uploadId}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts }),
    }
  );

  if (!complete.ok) {
    throw new Error('Unable to verify the upload.');
  }
};
