import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api-error';

const { redirect, serverApi } = vi.hoisted(() => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
  serverApi: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('./server-api', () => ({ serverApi }));

import { analysisRoute } from './analysis-route';

const analysis = {
  id: 'an_0123456789abcdef0123456789abcdef',
  status: 'ready',
  displayName: null,
  inputRevision: 2,
  configurationRevision: 0,
  createdAt: '2026-10-17T12:00:00.000Z',
  updatedAt: '2026-10-17T12:00:00.000Z',
  expiresAt: '2026-10-19T12:00:00.000Z',
  expiredAt: null,
  queuedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  failure: null,
  progress: null,
  execution: null,
} as const;

describe('analysisRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('presents missing, foreign, and expired analyses as unavailable', async () => {
    serverApi.mockRejectedValueOnce(new ApiClientError(404, 'NOT_FOUND', 'Not found.'));
    await expect(
      analysisRoute(analysis.id, { area: 'setup', step: 'data' })
    ).resolves.toBeUndefined();

    serverApi.mockResolvedValueOnce({ analysis: { ...analysis, status: 'expired' } });
    await expect(analysisRoute(analysis.id, { area: 'results' })).resolves.toBeUndefined();
  });

  it('allows dependency errors to reach the route error boundary', async () => {
    const error = new ApiClientError(503, 'DEPENDENCY_UNAVAILABLE', 'Redis unavailable.');
    serverApi.mockRejectedValueOnce(error);
    await expect(analysisRoute(analysis.id, { area: 'setup', step: 'data' })).rejects.toBe(error);
  });

  it('blocks forward setup navigation but permits earlier editable steps', async () => {
    serverApi
      .mockResolvedValueOnce({ analysis })
      .mockResolvedValueOnce({
        profile: {
          status: 'passed',
          inputRevision: 2,
        },
      })
      .mockResolvedValueOnce({ configuration: null, revision: 0 });
    await expect(analysisRoute(analysis.id, { area: 'setup', step: 'review' })).rejects.toThrow(
      `/analyses/${analysis.id}/setup/configuration`
    );

    serverApi.mockResolvedValueOnce({ analysis });
    serverApi.mockResolvedValueOnce({ profile: { status: 'passed', inputRevision: 2 } });
    serverApi.mockResolvedValueOnce({ configuration: null, revision: 0 });
    await expect(analysisRoute(analysis.id, { area: 'setup', step: 'data' })).resolves.toEqual(
      analysis
    );
  });

  it('routes terminal lifecycle states authoritatively', async () => {
    serverApi.mockResolvedValueOnce({ analysis: { ...analysis, status: 'failed' } });
    await expect(analysisRoute(analysis.id, { area: 'results' })).rejects.toThrow(
      `/analyses/${analysis.id}/run`
    );

    serverApi.mockResolvedValueOnce({ analysis: { ...analysis, status: 'succeeded' } });
    await expect(analysisRoute(analysis.id, { area: 'run' })).rejects.toThrow(
      `/analyses/${analysis.id}`
    );
  });
});
