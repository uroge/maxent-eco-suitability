import { describe, expect, it, vi } from 'vitest';
import { AnalysisQueueService } from './analysis-queue.service';

const payload = {
  analysisId: 'an_0123456789abcdef0123456789abcdef' as const,
  ownerId: 'user_123',
  inputRevision: 2,
};

describe('AnalysisQueueService validation jobs', () => {
  it('reuses a job ID for one request and creates a new ID for a retry', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new AnalysisQueueService(
      { add } as never,
      {} as never,
      {} as never,
    );

    await service.enqueueInputProfile(payload, '2026-10-27T12:00:00.000Z');
    await service.enqueueInputProfile(payload, '2026-10-27T12:00:00.000Z');
    await service.enqueueInputProfile(payload, '2026-10-27T12:01:00.000Z');

    const firstId = add.mock.calls[0]?.[2].jobId as string;
    const replayId = add.mock.calls[1]?.[2].jobId as string;
    const retryId = add.mock.calls[2]?.[2].jobId as string;

    expect(replayId).toBe(firstId);
    expect(retryId).not.toBe(firstId);
    expect(firstId).toMatch(
      /^an_0123456789abcdef0123456789abcdef-profile-2-[a-f0-9]{16}$/,
    );
  });
});
