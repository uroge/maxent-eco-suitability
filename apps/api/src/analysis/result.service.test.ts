import { describe, expect, it, vi } from 'vitest';
import { analysisArtifactSpecifications } from '@ecosuitability/contracts';
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
    reproducibility: {
      inputRevision: 2,
      configurationRevision: 1,
      inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
      configurationFingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
      seed: 42,
    },
    artifacts: analysisArtifactSpecifications.map((definition, index) => {
      const id =
        index === 0 ? artifactId : `ar_${String(index).padStart(32, '0')}`;
      return {
        id,
        kind: definition.kind,
        filename: definition.filename,
        contentType: definition.contentType,
        size: index + 1,
        sha256: 'a'.repeat(64),
        sha256Verification: 'worker-verified' as const,
        createdAt: '2026-09-02T12:00:00.000Z',
        storageKey: `analyses/${analysisId}/results/${id}/${definition.filename}`,
      };
    }),
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

  it('creates a fresh signed URL for each request and masks storage failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00.000Z'));
    const analysis = createAnalysis('2026-09-04T12:00:00.000Z');
    const presignGet = vi
      .fn()
      .mockResolvedValueOnce('https://download.example/first')
      .mockResolvedValueOnce('https://download.example/second')
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const service = new ResultService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      { presignGet } as never,
    );

    await expect(
      service.download(principal, analysisId, artifactId),
    ).resolves.toMatchObject({ downloadUrl: 'https://download.example/first' });
    await expect(
      service.download(principal, analysisId, artifactId),
    ).resolves.toMatchObject({
      downloadUrl: 'https://download.example/second',
    });
    await expect(
      service.download(principal, analysisId, artifactId),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
    });
    vi.useRealTimers();
  });
});
