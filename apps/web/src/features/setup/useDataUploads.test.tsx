import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataUploads } from './useDataUploads';

const mocks = vi.hoisted(() => ({
  api: {
    json: vi.fn(),
    request: vi.fn(),
  },
  push: vi.fn(),
  uploadDataset: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/direct-upload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/direct-upload')>()),
  uploadDataset: mocks.uploadDataset,
}));

vi.mock('../analysis/api', () => ({
  analysisKeys: {
    inputs: (id: string) => ['analysis', id, 'inputs'] as const,
  },
  idempotencyKey: () => 'stable-test-key',
  useAnalysisApi: () => mocks.api,
}));

const analysisId = 'an_0123456789abcdef0123456789abcdef';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
    }
  >
    {children}
  </QueryClientProvider>
);

describe('useDataUploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.json.mockImplementation(async (path: string) =>
      path.endsWith('/upload-datasets')
        ? { uploads: [] }
        : { inputs: { analysisId, inputRevision: 0, datasets: [] } }
    );
    mocks.uploadDataset.mockImplementation(() => new Promise<string>(() => undefined));
  });

  it('starts a selected batch only once when activated repeatedly', async () => {
    const { result } = renderHook(() => useDataUploads(analysisId), { wrapper });
    await waitFor(() => expect(result.current.inputs.isSuccess).toBe(true));

    act(() => {
      result.current.setOccurrenceFiles([new File(['occurrence'], 'occurrences.csv')]);
      result.current.setPredictorFiles([new File(['predictor'], 'elevation.tif')]);
    });

    act(() => {
      void result.current.startSelected();
      void result.current.startSelected();
    });

    await waitFor(() => expect(mocks.uploadDataset).toHaveBeenCalledTimes(2));
    expect(result.current.occurrenceFiles).toEqual([]);
    expect(result.current.predictorFiles).toEqual([]);
    expect(result.current.starting).toBe(true);
  });
});
