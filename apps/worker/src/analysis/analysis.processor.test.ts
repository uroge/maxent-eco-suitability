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

const createServiceLifecycle = () => ({
  beginJob: vi.fn().mockReturnValue(true),
  endJob: vi.fn(),
  beginDraining: vi.fn(),
  waitForDrain: vi.fn(),
});

describe('AnalysisProcessor', () => {
  it('claims an execution, emits stable progress, and completes it', async () => {
    const lifecycle = {
      claim: vi.fn().mockResolvedValue('claimed'),
      updateProgress: vi.fn().mockResolvedValue('updated'),
      finish: vi.fn().mockResolvedValue('succeeded'),
      finaliseCancellation: vi.fn(),
    };
    const serviceLifecycle = createServiceLifecycle();
    const processor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      lifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
      serviceLifecycle as never,
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
    expect(serviceLifecycle.endJob).toHaveBeenCalledOnce();
  }, 10_000);

  it('finalizes cancellation without processing a claimed cancelled job', async () => {
    const lifecycle = {
      claim: vi.fn().mockResolvedValue('cancelled'),
      updateProgress: vi.fn(),
      finish: vi.fn(),
      finaliseCancellation: vi.fn().mockResolvedValue(undefined),
    };
    const serviceLifecycle = createServiceLifecycle();
    const processor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      lifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
      serviceLifecycle as never,
    );
    const job = createJob();

    await processor.process(job as never);

    expect(lifecycle.finaliseCancellation).toHaveBeenCalledWith(
      job.data.analysisId,
    );
    expect(lifecycle.updateProgress).not.toHaveBeenCalled();
  });

  it('does not claim a job after graceful draining begins', async () => {
    const lifecycle = {
      claim: vi.fn(),
      updateProgress: vi.fn(),
      finish: vi.fn(),
      finaliseCancellation: vi.fn(),
    };
    const serviceLifecycle = {
      ...createServiceLifecycle(),
      beginJob: vi.fn().mockReturnValue(false),
    };
    const processor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      lifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
      serviceLifecycle as never,
    );

    await processor.process(createJob() as never);

    expect(lifecycle.claim).not.toHaveBeenCalled();
  });

  it('lets cancellation win without scheduling a retry or failure', async () => {
    const lifecycle = {
      claim: vi.fn().mockResolvedValue('claimed'),
      updateProgress: vi.fn().mockResolvedValue('cancelled'),
      finish: vi.fn(),
      finaliseCancellation: vi.fn().mockResolvedValue(undefined),
    };
    const serviceLifecycle = createServiceLifecycle();
    const processor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      lifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
      serviceLifecycle as never,
    );

    await expect(
      processor.process(createJob() as never),
    ).resolves.toBeUndefined();

    expect(lifecycle.finaliseCancellation).toHaveBeenCalledOnce();
    expect(lifecycle.finish).not.toHaveBeenCalled();
    expect(serviceLifecycle.endJob).toHaveBeenCalledOnce();
  });

  it('uses BullMQ attemptsMade to distinguish retryable and final failures', async () => {
    const retryLifecycle = {
      claim: vi.fn().mockResolvedValue('claimed'),
      updateProgress: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      finish: vi.fn().mockResolvedValue('queued'),
      finaliseCancellation: vi.fn(),
    };
    const retryProcessor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      retryLifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
      createServiceLifecycle() as never,
    );
    const finalLifecycle = {
      claim: vi.fn().mockResolvedValue('claimed'),
      updateProgress: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
      finish: vi.fn().mockResolvedValue('failed'),
      finaliseCancellation: vi.fn(),
    };
    const finalProcessor = new AnalysisProcessor(
      { setGlobalConcurrency: vi.fn() } as never,
      finalLifecycle as never,
      { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
      { warn: vi.fn() } as never,
      createServiceLifecycle() as never,
    );
    const retryJob = createJob();
    const finalJob = { ...createJob(), attemptsMade: 2 };

    await expect(retryProcessor.process(retryJob as never)).rejects.toThrow(
      'Redis unavailable',
    );
    await expect(
      finalProcessor.process(finalJob as never),
    ).resolves.toBeUndefined();

    expect(retryLifecycle.finish).toHaveBeenCalledWith(
      retryJob.data.analysisId,
      retryJob.id,
      1,
      'queued',
      null,
      expect.objectContaining({ stage: 'retrying', percent: 0 }),
    );
    expect(finalLifecycle.finish).toHaveBeenCalledWith(
      finalJob.data.analysisId,
      finalJob.id,
      3,
      'failed',
      { code: 'EXECUTION_FAILED', message: 'Analysis execution failed.' },
      expect.objectContaining({ stage: 'failed', percent: 0 }),
    );
  });
});
