import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadDataset } from '@/lib/direct-upload';
import { useDataUploads } from './useDataUploads';

const mocks = vi.hoisted(() => ({
  api: {
    json: vi.fn(),
    request: vi.fn(),
  },
  push: vi.fn(),
  replace: vi.fn(),
  uploadDataset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('@/lib/direct-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/direct-upload')>()),
  uploadDataset: mocks.uploadDataset,
}));

vi.mock('../analysis/api', () => ({
  analysisKeys: {
    analysis: (id: string) => ['analysis', id] as const,
    inputs: (id: string) => ['analysis', id, 'inputs'] as const,
    profile: (id: string) => ['analysis', id, 'profile'] as const,
    uploads: (id: string) => ['analysis', id, 'inputs', 'uploads'] as const,
  },
  idempotencyKey: () => 'stable-test-key',
  useAnalysisApi: () => mocks.api,
}));

const analysisId = 'an_0123456789abcdef0123456789abcdef';

const createWrapper = (strict = false) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {strict ? <StrictMode>{children}</StrictMode> : children}
    </QueryClientProvider>
  );
  return Wrapper;
};

const successfulUpload = async (
  ...parameters: Parameters<typeof uploadDataset>
): Promise<string> => {
  const kind = parameters[2];
  const options = parameters[5];
  const datasetId =
    kind === 'occurrence'
      ? 'ds_11111111111111111111111111111111'
      : 'ds_22222222222222222222222222222222';
  options.onDatasetReady?.(datasetId);
  options.onProgress?.({ loadedBytes: 10, totalBytes: 10 });
  return datasetId;
};

describe('useDataUploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.json.mockImplementation(
      async (path: string, _schema: unknown, options?: RequestInit) => {
        if (path.endsWith('/upload-datasets')) {
          return { uploads: [] };
        }
        if (path.endsWith('/inputs/complete') && options?.method === 'POST') {
          return { analysis: { analysisId, inputRevision: 2 } };
        }
        if (path.endsWith('/input-profile') && options?.method === 'POST') {
          return { profile: { analysisId, status: 'queued' } };
        }
        return { inputs: { analysisId, inputRevision: 1, datasets: [] } };
      }
    );
    mocks.api.request.mockResolvedValue(new Response(null, { status: 204 }));
    mocks.uploadDataset.mockImplementation(() => new Promise<string>(() => undefined));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts a selected batch only once when activated repeatedly', async () => {
    const { result } = renderHook(() => useDataUploads(analysisId), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.queries.inputs.isSuccess).toBe(true));

    act(() => {
      result.current.actions.setOccurrenceFiles([new File(['occurrence'], 'occurrences.csv')]);
      result.current.actions.setPredictorFiles([new File(['predictor'], 'elevation.tif')]);
    });

    act(() => {
      void result.current.actions.startSelected();
      void result.current.actions.startSelected();
    });

    await waitFor(() => expect(mocks.uploadDataset).toHaveBeenCalledTimes(2));
    expect(result.current.state.occurrenceFiles).toEqual([]);
    expect(result.current.state.predictorFiles).toEqual([]);
    expect(result.current.derived.starting).toBe(true);
  });

  it('shares one typed completion and profile sequence across a successful manual batch', async () => {
    mocks.uploadDataset.mockImplementation(successfulUpload);
    const { result } = renderHook(() => useDataUploads(analysisId), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.queries.inputs.isSuccess).toBe(true));
    act(() => {
      result.current.actions.setOccurrenceFiles([new File(['occurrence'], 'occurrences.csv')]);
      result.current.actions.setPredictorFiles([new File(['predictor'], 'elevation.tif')]);
    });

    await act(() => result.current.actions.startSelected());

    expect(mocks.uploadDataset).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.json.mock.calls.filter(
        ([path, , options]) =>
          String(path).endsWith('/inputs/complete') && options?.method === 'POST'
      )
    ).toHaveLength(1);
    expect(
      mocks.api.json.mock.calls.filter(
        ([path, , options]) => String(path).endsWith('/input-profile') && options?.method === 'POST'
      )
    ).toHaveLength(1);
    expect(mocks.push).toHaveBeenCalledWith(`/analyses/${analysisId}/setup/validation`);
    expect(result.current.state.tasks.every((task) => task.status === 'complete')).toBe(true);
  });

  it('runs the example through the same batch and finish sequence once under Strict Mode', async () => {
    mocks.uploadDataset.mockImplementation(successfulUpload);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => ({
        blob: async () => new Blob([url]),
        ok: true,
      }))
    );
    const { result } = renderHook(() => useDataUploads(analysisId), {
      wrapper: createWrapper(true),
    });
    await waitFor(() => expect(result.current.queries.inputs.isSuccess).toBe(true));

    await act(async () => {
      await Promise.all([
        result.current.actions.startExample(),
        result.current.actions.startExample(),
      ]);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.uploadDataset).toHaveBeenCalledTimes(2);
    expect(
      mocks.api.json.mock.calls.filter(([path]) => String(path).endsWith('/inputs/complete'))
    ).toHaveLength(1);
    expect(
      mocks.api.json.mock.calls.filter(([path]) => String(path).endsWith('/input-profile'))
    ).toHaveLength(1);
    expect(mocks.replace).toHaveBeenCalledWith(`/analyses/${analysisId}/setup/validation`);
  });

  it('cancels an active task into paused state and completes through the shared retry path', async () => {
    mocks.uploadDataset.mockImplementationOnce(
      (...parameters: Parameters<typeof uploadDataset>) =>
        new Promise<string>((_resolve, reject) => {
          parameters[5].onDatasetReady?.('ds_22222222222222222222222222222222');
          parameters[5].signal?.addEventListener('abort', () => {
            reject(new DOMException('Paused', 'AbortError'));
          });
        })
    );
    const { result } = renderHook(() => useDataUploads(analysisId), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.queries.inputs.isSuccess).toBe(true));
    act(() => {
      result.current.actions.setPredictorFiles([new File(['predictor'], 'elevation.tif')]);
    });
    act(() => {
      void result.current.actions.startSelected();
    });
    await waitFor(() => expect(result.current.state.tasks[0]?.status).toBe('uploading'));

    act(() => {
      result.current.actions.pause(result.current.state.tasks[0]!.key);
    });
    await waitFor(() => expect(result.current.state.tasks[0]?.status).toBe('paused'));
    mocks.uploadDataset.mockImplementation(successfulUpload);

    await act(() => result.current.actions.retry(result.current.state.tasks[0]!));

    expect(result.current.state.tasks[0]?.status).toBe('complete');
    expect(mocks.push).toHaveBeenCalledWith(`/analyses/${analysisId}/setup/validation`);
  });

  it('preserves structured mutation errors in workflow state', async () => {
    mocks.api.request.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            details: null,
            message: 'That temporary upload has expired.',
            requestId: 'request-test',
            version: '1',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const { result } = renderHook(() => useDataUploads(analysisId), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.queries.inputs.isSuccess).toBe(true));

    await act(() => result.current.actions.discardUpload('ds_11111111111111111111111111111111'));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.message).toBe('That temporary upload has expired.');
  });
});
