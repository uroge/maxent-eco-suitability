import { describe, expect, it, vi } from 'vitest';
import { ResultService } from './result.service';

const analysisId = 'an_0123456789abcdef0123456789abcdef';

const createProvisional = () => ({
  analysisId,
  jobId: analysisId,
  attempt: 1,
  candidateCompletedAt: null,
  publicationState: 'provisioned',
  artifacts: [
    {
      id: 'ar_0123456789abcdef0123456789abcdef',
      kind: 'execution-summary',
      filename: 'execution-summary.json',
      storageKey: `analyses/${analysisId}/results/ar_0123456789abcdef0123456789abcdef/execution-summary.json`,
      contentType: 'application/json',
      contentDisposition: 'attachment; filename="execution-summary.json"',
      size: 0,
      sha256: '0'.repeat(64),
      sha256Verification: 'worker-generated',
      createdAt: '',
    },
    {
      id: 'ar_fedcba9876543210fedcba9876543210',
      kind: 'run-log',
      filename: 'run.log.txt',
      storageKey: `analyses/${analysisId}/results/ar_fedcba9876543210fedcba9876543210/run.log.txt`,
      contentType: 'text/plain; charset=utf-8',
      contentDisposition: 'attachment; filename="run.log.txt"',
      size: 0,
      sha256: '0'.repeat(64),
      sha256Verification: 'worker-generated',
      createdAt: '',
    },
  ],
});

describe('ResultService', () => {
  it('publishes verified artifacts with stable provisional keys', async () => {
    const provisional = createProvisional();
    const completed = {
      ...provisional,
      candidateCompletedAt: '2026-09-02T12:00:00.000Z',
    };
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(provisional),
      completeResult: vi.fn().mockResolvedValue(completed),
      publishResult: vi.fn().mockResolvedValue('succeeded'),
    };
    const objects = new Map<
      string,
      {
        size: number;
        contentType: string;
        contentDisposition: string;
        sha256: string;
      }
    >();
    const storage = {
      put: vi.fn(
        async (
          key: string,
          body: Uint8Array,
          contentType: string,
          contentDisposition: string,
          sha256: string,
        ) => {
          objects.set(key, {
            size: body.length,
            contentType,
            contentDisposition,
            sha256,
          });
        },
      ),
      head: vi.fn(async (key: string) => objects.get(key)),
    };
    const service = new ResultService(lifecycle as never, storage as never);

    await expect(
      service.publish(
        { id: analysisId, data: { analysisId, ownerId: 'user_123' } },
        1,
      ),
    ).resolves.toBe('succeeded');

    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(lifecycle.publishResult).toHaveBeenCalledWith(
      analysisId,
      analysisId,
      1,
      expect.objectContaining({ completedAt: '2026-09-02T12:00:00.000Z' }),
      expect.arrayContaining([
        expect.objectContaining({
          storageKey: provisional.artifacts[0].storageKey,
        }),
      ]),
    );
  });

  it('reuses provisional keys and verifies both deterministic artifacts before publishing', async () => {
    const provisional = createProvisional();
    const completed = {
      ...provisional,
      candidateCompletedAt: '2026-09-02T12:00:00.000Z',
    };
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(provisional),
      completeResult: vi.fn().mockResolvedValue(completed),
      publishResult: vi.fn().mockResolvedValue('succeeded'),
    };
    const storage = {
      put: vi.fn(),
      head: vi.fn(async (key: string) => {
        const artifact = completed.artifacts.find(
          (item) => item.storageKey === key,
        )!;
        const size = key.endsWith('.json') ? 62 : 74;
        return {
          size,
          contentType: artifact.contentType,
          contentDisposition: artifact.contentDisposition,
          sha256: undefined,
        };
      }),
    };
    const service = new ResultService(lifecycle as never, storage as never);

    await expect(
      service.publish(
        { id: analysisId, data: { analysisId, ownerId: 'user_123' } },
        1,
      ),
    ).rejects.toThrow('Result artifact storage verification failed.');

    expect(lifecycle.provisionResult).toHaveBeenCalledOnce();
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('publishes an already verified provisional result without writing artifacts again', async () => {
    const provisional = {
      ...createProvisional(),
      candidateCompletedAt: '2026-09-02T12:00:00.000Z',
      publicationState: 'verified' as const,
      artifacts: createProvisional().artifacts.map((artifact) => ({
        ...artifact,
        size: 10,
        sha256: 'a'.repeat(64),
        createdAt: '2026-09-02T12:00:00.000Z',
      })),
    };
    const lifecycle = {
      provisionResult: vi.fn().mockResolvedValue(provisional),
      publishResult: vi.fn().mockResolvedValue('succeeded'),
    };
    const storage = {
      put: vi.fn(),
      head: vi.fn(async (key: string) => {
        const artifact = provisional.artifacts.find(
          (item) => item.storageKey === key,
        )!;
        return {
          size: artifact.size,
          contentType: artifact.contentType,
          contentDisposition: artifact.contentDisposition,
          sha256: artifact.sha256,
        };
      }),
    };
    const service = new ResultService(lifecycle as never, storage as never);

    await expect(
      service.resumeVerified(
        { id: analysisId, data: { analysisId, ownerId: 'user_123' } },
        2,
      ),
    ).resolves.toBe('succeeded');
    expect(storage.put).not.toHaveBeenCalled();
    expect(lifecycle.publishResult).toHaveBeenCalledWith(
      analysisId,
      analysisId,
      2,
      expect.any(Object),
      expect.any(Array),
    );
  });
});
