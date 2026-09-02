import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './direct-upload';
import { uploadDataset } from './direct-upload';

type XhrResponse = {
  status: number;
  etag?: string;
  pending?: boolean;
};

type XhrRequest = {
  url: string;
  complete: () => void;
};

const defaultResponse: XhrResponse = { status: 200, etag: '"etag"' };

const createXhrHarness = (responses: XhrResponse[] = []) => {
  let active = 0;
  let maximumActive = 0;
  const requests: XhrRequest[] = [];

  class FakeXmlHttpRequest {
    public static harness = { active, maximumActive, requests };

    public readonly upload = {
      onprogress: null as ((event: ProgressEvent<EventTarget>) => void) | null,
    };

    public onload: (() => void) | null = null;

    public onerror: (() => void) | null = null;

    public onabort: (() => void) | null = null;

    public status = 0;

    private response: XhrResponse = defaultResponse;

    private url = '';

    public open(_method: string, url: string): void {
      this.url = url;
    }

    public setRequestHeader(): void {}

    public getResponseHeader(name: string): string | null {
      return name.toLowerCase() === 'etag' ? (this.response.etag ?? null) : null;
    }

    public send(body: Blob): void {
      this.response = responses.shift() ?? defaultResponse;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      FakeXmlHttpRequest.harness.active = active;
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: body.size,
      } as ProgressEvent<EventTarget>);
      FakeXmlHttpRequest.harness.maximumActive = maximumActive;
      const complete = (): void => {
        active -= 1;
        FakeXmlHttpRequest.harness.active = active;
        this.status = this.response.status;
        this.onload?.();
      };
      requests.push({ url: this.url, complete });
      if (!this.response.pending) {
        queueMicrotask(complete);
      }
    }

    public abort(): void {
      active = Math.max(0, active - 1);
      FakeXmlHttpRequest.harness.active = active;
      this.onabort?.();
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
  return FakeXmlHttpRequest.harness;
};

const createApi = (file: {
  multipart: boolean;
  uploadUrl: string | null;
  partSizeBytes: number | null;
}) => {
  const request = vi.fn(async (path: string, options?: RequestInit) => {
    if (path.endsWith('/upload-datasets') && options?.method === 'POST') {
      return Response.json(
        { dataset: { id: 'ds_0123456789abcdef0123456789abcdef' } },
        { status: 201 }
      );
    }

    if (path.endsWith('/files') && options?.method === 'POST') {
      return Response.json({ file: { id: 'up_0123456789abcdef0123456789abcdef', ...file } });
    }

    if (path.endsWith('/parts')) {
      const { partNumbers } = JSON.parse(String(options?.body)) as { partNumbers: number[] };
      return Response.json({
        parts: partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://storage.test/part-${partNumber}`,
        })),
      });
    }

    if (path.endsWith('/url')) {
      return Response.json({ uploadUrl: 'https://storage.test/refreshed' });
    }

    if (path.endsWith('/complete') && options?.method === 'POST') {
      return Response.json({ dataset: { id: 'ds_0123456789abcdef0123456789abcdef' } });
    }

    return new Response(null, { status: 204 });
  });

  return { request } satisfies ApiClient;
};

const fakeFile = (name: string, size: number): File =>
  ({
    name,
    size,
    type: 'text/plain',
    slice: () => new Blob(['x']),
  }) as File;

const upload = (
  api: ApiClient,
  file: File,
  options: Partial<Parameters<typeof uploadDataset>[5]> = {}
) =>
  uploadDataset(api, 'an_0123456789abcdef0123456789abcdef', 'occurrence', 'csv', [{ file }], {
    idempotencyKey: 'upload-key-123',
    ...options,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('uploadDataset', () => {
  it('reports aggregate progress for a direct upload', async () => {
    const progress = vi.fn();
    createXhrHarness();

    await upload(
      createApi({
        multipart: false,
        uploadUrl: 'https://storage.test/direct',
        partSizeBytes: null,
      }),
      fakeFile('occurrences.csv', 10),
      { onProgress: progress }
    );

    expect(progress).toHaveBeenLastCalledWith({ loadedBytes: 10, totalBytes: 10 });
  });

  it('refreshes a failed direct-upload URL once before retrying', async () => {
    vi.useFakeTimers();
    const api = createApi({
      multipart: false,
      uploadUrl: 'https://storage.test/expired',
      partSizeBytes: null,
    });
    createXhrHarness([{ status: 403 }, { status: 200, etag: '"refreshed"' }]);

    const operation = upload(api, fakeFile('occurrences.csv', 10));
    await vi.advanceTimersByTimeAsync(1000);
    await operation;

    expect(api.request).toHaveBeenCalledWith(
      expect.stringMatching(/\/url$/),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('cancels the storage request and aborts the server session', async () => {
    const controller = new AbortController();
    const api = createApi({
      multipart: false,
      uploadUrl: 'https://storage.test/direct',
      partSizeBytes: null,
    });
    const harness = createXhrHarness([{ status: 200, pending: true }]);

    const operation = upload(api, fakeFile('occurrences.csv', 10), { signal: controller.signal });
    await vi.waitFor(() => expect(harness.active).toBe(1));
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.request).toHaveBeenCalledWith(
      expect.stringMatching(/upload-datasets\/ds_.*$/),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('limits multipart storage requests to four concurrent parts', async () => {
    const harness = createXhrHarness(
      Array.from({ length: 4 }, () => ({ status: 200, pending: true, etag: '"part"' }))
    );
    const api = createApi({
      multipart: true,
      uploadUrl: null,
      partSizeBytes: 16 * 1024 * 1024,
    });
    const operation = upload(api, fakeFile('predictor.tif', 64 * 1024 * 1024));

    await vi.waitFor(() => expect(harness.requests).toHaveLength(4));
    expect(harness.maximumActive).toBe(4);
    harness.requests.forEach((request) => request.complete());

    await operation;
  });
});
