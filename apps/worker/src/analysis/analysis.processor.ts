import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import {
  analysisJobName,
  analysisQueueName,
  type AnalysisJobPayload,
  type AnalysisProgress,
} from '@ecosuitability/contracts';
import type { Job, Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import type { WorkerEnvironment } from '../env';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';
import { LifecycleService } from '../platform/lifecycle.service';
import { ResultService } from './result.service';

const stages = [
  ['preparing', 25],
  ['validating-inputs', 50],
  ['executing', 75],
  ['finalizing', 100],
] as const;

type Stage = (typeof stages)[number][0];

class RetryableExecutionError extends Error {}

class ExecutionCancelledError extends Error {}

@Processor(analysisQueueName, { concurrency: 1 })
@Injectable()
export class AnalysisProcessor
  extends WorkerHost
  implements BeforeApplicationShutdown
{
  public constructor(
    @InjectQueue(analysisQueueName) private readonly queue: Queue,
    private readonly lifecycle: WorkerLifecycleRepository,
    private readonly config: ConfigService<WorkerEnvironment, true>,
    private readonly logger: Logger,
    private readonly serviceLifecycle: LifecycleService,
    private readonly results: ResultService,
  ) {
    super();
  }

  public async onModuleInit(): Promise<void> {
    await this.queue.setGlobalConcurrency(1);
  }

  public async beforeApplicationShutdown(): Promise<void> {
    this.serviceLifecycle.beginDraining();
    await this.worker.pause(true);
    await this.serviceLifecycle.waitForDrain();
  }

  public async process(job: Job<AnalysisJobPayload>): Promise<void> {
    if (job.name !== analysisJobName || !job.id) {
      return;
    }

    if (!this.serviceLifecycle.beginJob()) {
      return;
    }

    const attempt = job.attemptsMade + 1;
    let timeout: NodeJS.Timeout | undefined;

    try {
      const claim = await this.lifecycle.claim(
        job.data.analysisId,
        job.id,
        attempt,
      );
      if (claim === 'cancelled') {
        await this.lifecycle.finaliseCancellation(job.data.analysisId);
        return;
      }
      if (claim === 'terminal' || claim === 'stale_attempt') {
        return;
      }
      if (claim === 'dependency_unavailable') {
        throw new RetryableExecutionError('Lifecycle state is unavailable.');
      }

      const resumed = await this.results.resumeVerified(job, attempt);
      if (resumed === 'cancelled') {
        await this.lifecycle.finaliseCancellation(job.data.analysisId);
        return;
      }
      if (
        resumed === 'succeeded' ||
        resumed === 'stale_attempt' ||
        resumed === 'terminal'
      ) {
        return;
      }

      const controller = new AbortController();
      timeout = setTimeout(() => {
        controller.abort(new Error('Analysis execution timed out.'));
      }, this.config.getOrThrow('ANALYSIS_EXECUTION_TIMEOUT_MS'));

      for (const [stage, percent] of stages) {
        await this.assertActive(
          job,
          attempt,
          stage,
          percent,
          controller.signal,
        );
        await this.delay(controller.signal);
      }

      const outcome = await this.results.publish(job, attempt);
      if (outcome === 'cancelled') {
        await this.lifecycle.finaliseCancellation(job.data.analysisId);
      }
    } catch (error) {
      if (error instanceof ExecutionCancelledError) {
        return;
      }

      await this.handleFailure(job, attempt, error);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }

      this.serviceLifecycle.endJob();
    }
  }

  private async assertActive(
    job: Job<AnalysisJobPayload>,
    attempt: number,
    stage: Stage,
    percent: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      throw signal.reason;
    }

    const outcome = await this.lifecycle.updateProgress(
      job.data.analysisId,
      job.id!,
      attempt,
      this.progress(stage, percent, attempt),
    );
    if (outcome === 'cancelled') {
      await this.lifecycle.finaliseCancellation(job.data.analysisId);
      throw new ExecutionCancelledError('Analysis execution was cancelled.');
    }
    if (outcome === 'dependency_unavailable') {
      throw new RetryableExecutionError('Lifecycle state is unavailable.');
    }
    if (outcome === 'stale_attempt') {
      throw new Error('Analysis execution is no longer current.');
    }

    await job.updateProgress({ stage, percent, attempt });
  }

  private async handleFailure(
    job: Job<AnalysisJobPayload>,
    attempt: number,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Execution failed.';
    const totalAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= totalAttempts;
    const status = isFinalAttempt ? 'failed' : 'queued';
    const progress = this.progress(
      isFinalAttempt ? 'failed' : 'retrying',
      0,
      attempt,
    );
    const outcome = await this.lifecycle.finish(
      job.data.analysisId,
      job.id!,
      attempt,
      status,
      isFinalAttempt
        ? { code: 'EXECUTION_FAILED', message: 'Analysis execution failed.' }
        : null,
      progress,
    );

    if (outcome === 'cancelled') {
      await this.lifecycle.finaliseCancellation(job.data.analysisId);
      return;
    }
    if (outcome === 'terminal' || outcome === 'stale_attempt') {
      return;
    }

    this.logger.warn(
      { analysisId: job.data.analysisId, attempt, error: message },
      'Analysis execution attempt failed.',
    );
    if (!isFinalAttempt) {
      throw error instanceof Error
        ? error
        : new RetryableExecutionError(message);
    }

    await this.lifecycle.cleanupProvisional(job.data.analysisId);
  }

  private progress(
    stage: AnalysisProgress['stage'],
    percent: number,
    attempt: number,
  ): AnalysisProgress {
    return {
      stage,
      percent,
      attempt,
      updatedAt: new Date().toISOString(),
    };
  }

  private async delay(signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 1_000);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }
}
