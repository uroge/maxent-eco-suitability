import { describe, expect, it, vi } from 'vitest';
import { ResultService } from './result.service';

const analysisId = 'an_0123456789abcdef0123456789abcdef';

const artifactId = 'ar_0123456789abcdef0123456789abcdef';

const principal = {
  userId: 'user_123',
  sessionId: 'session_123',
  role: 'user' as const,
};

const createAnalysis = (resultExpiresAt: string) => ({
  status: 'succeeded',
  resultManifest: {
    analysisId,
    completedAt: '2026-09-02T12:00:00.000Z',
    resultExpiresAt,
    artifacts: [
      {
        id: artifactId,
        kind: 'execution-summary',
        filename: 'execution-summary.json',
        contentType: 'application/json',
        size: 20,
        sha256: 'a'.repeat(64),
        sha256Verification: 'worker-generated',
        createdAt: '2026-09-02T12:00:00.000Z',
        storageKey: `analyses/${analysisId}/results/${artifactId}/execution-summary.json`,
      },
      {
        id: 'ar_fedcba9876543210fedcba9876543210',
        kind: 'run-log',
        filename: 'run.log.txt',
        contentType: 'text/plain; charset=utf-8',
        size: 10,
        sha256: 'b'.repeat(64),
        sha256Verification: 'worker-generated',
        createdAt: '2026-09-02T12:00:00.000Z',
        storageKey: `analyses/${analysisId}/results/ar_fedcba9876543210fedcba9876543210/run.log.txt`,
      },
    ],
  },
});

describe('ResultService', () => {
  it('omits internal storage keys from manifests and issues bounded download URLs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
    const analysis = createAnalysis('2026-09-02T12:02:00.000Z');
    const storage = {
      presignGet: vi.fn().mockResolvedValue('https://download.example/test'),
    };
    const service = new ResultService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      storage as never,
    );

    await expect(
      service.manifest(principal, analysisId),
    ).resolves.not.toHaveProperty('artifacts.0.storageKey');
    await expect(
      service.download(principal, analysisId, artifactId),
    ).resolves.toMatchObject({ downloadUrl: 'https://download.example/test' });
    expect(storage.presignGet).toHaveBeenCalledWith(
      analysis.resultManifest.artifacts[0].storageKey,
      120,
    );
    vi.useRealTimers();
  });

  it('masks missing artifacts and expired results as not found', async () => {
    const service = new ResultService(
      {
        findOwned: vi
          .fn()
          .mockResolvedValue(createAnalysis('2020-01-01T00:00:00.000Z')),
      } as never,
      { presignGet: vi.fn() } as never,
    );

    await expect(
      service.download(principal, analysisId, artifactId),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
