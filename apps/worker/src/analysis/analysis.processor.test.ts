import { describe, expect, it, vi } from 'vitest';
import { AnalysisProcessor } from './analysis.processor';

const createJob = () => ({
  id: 'an_0123456789abcdef0123456789abcdef',
  name: 'run-analysis',
  attemptsMade: 0,
  opts: { attempts: 3 },
  data: {
    analysisId: 'an_0123456789abcdef0123456789abcdef',
    ownerId: 'user_123',
  },
  updateProgress: vi.fn().mockResolvedValue(undefined),
});

describe('AnalysisProcessor', () => {
  it('claims an execution, emits stable progress, and completes it', async () => {
    const lifecycle = {
      claim: vi.fn().mockResolvedValue('claimed'),
      updateProgress: vi.fn().mockResolvedValue('updated'),
      finish: vi.fn().mockResolvedValue('succeeded'),
      finaliseCancellation: vi.fn(),
    };
    const processor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      lifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
    );
    const job = createJob();

    await processor.process(job as never);

    expect(lifecycle.claim).toHaveBeenCalledWith(
      job.data.analysisId,
      job.id,
      1,
    );
    expect(lifecycle.updateProgress).toHaveBeenCalledTimes(4);
    expect(lifecycle.finish).toHaveBeenCalledWith(
      job.data.analysisId,
      job.id,
      1,
      'succeeded',
      null,
      expect.objectContaining({ stage: 'completed', percent: 100 }),
    );
  }, 10_000);

  it('finalizes cancellation without processing a claimed cancelled job', async () => {
    const lifecycle = {
      claim: vi.fn().mockResolvedValue('cancelled'),
      updateProgress: vi.fn(),
      finish: vi.fn(),
      finaliseCancellation: vi.fn().mockResolvedValue(undefined),
    };
    const processor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      lifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
    );
    const job = createJob();

    await processor.process(job as never);

    expect(lifecycle.finaliseCancellation).toHaveBeenCalledWith(
      job.data.analysisId,
    );
    expect(lifecycle.updateProgress).not.toHaveBeenCalled();
  });
});
