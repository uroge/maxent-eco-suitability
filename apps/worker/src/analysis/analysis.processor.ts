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
import { ResultLifecycleError, ResultService } from './result.service';
import {
  RValidationClient,
  RValidationCancelledError,
  RRuntimeError,
  ScientificValidationError,
} from './r-validation.client';

type Stage = AnalysisProgress['stage'];

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
    private readonly validation: RValidationClient,
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

      const resumed = await this.results.resumeAvailable(job, attempt);
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
      if (resumed === 'dependency_unavailable') {
        throw new RetryableExecutionError('Lifecycle state is unavailable.');
      }

      const provisional = await this.results.provision(job, attempt);
      if (typeof provisional === 'string') {
        if (provisional === 'cancelled') {
          await this.lifecycle.finaliseCancellation(job.data.analysisId);
        }
        if (provisional === 'dependency_unavailable') {
          throw new RetryableExecutionError('Lifecycle state is unavailable.');
        }
        return;
      }

      const controller = new AbortController();
      timeout = setTimeout(() => {
        controller.abort(new Error('Analysis execution timed out.'));
      }, this.config.getOrThrow('ANALYSIS_EXECUTION_TIMEOUT_MS'));

      await this.assertActive(
        job,
        attempt,
        'downloading',
        5,
        controller.signal,
      );
      let uploading = provisional;
      let heartbeatStage: AnalysisProgress['stage'] = 'downloading';
      let heartbeatPercent = 5;
      await this.validation.validate(
        job.data.analysisId,
        job.id,
        attempt,
        controller.signal,
        async (event, summary, generation) => {
          const outcome = await this.lifecycle.updateValidation(
            job.data.analysisId,
            job.id!,
            attempt,
            event,
            summary,
            null,
            generation,
          );
          if (outcome === 'cancelled') {
            await this.lifecycle.finaliseCancellation(job.data.analysisId);
            throw new ExecutionCancelledError(
              'Analysis execution was cancelled.',
            );
          }
          if (outcome === 'dependency_unavailable') {
            throw new RetryableExecutionError(
              'Lifecycle state is unavailable.',
            );
          }
          if (outcome === 'stale_attempt' || outcome === 'terminal') {
            throw new ExecutionCancelledError(
              'Analysis execution is no longer current.',
            );
          }
          heartbeatStage = this.eventStage(event.stage);
          heartbeatPercent = event.percent;
          await job.updateProgress({
            stage: heartbeatStage,
            percent: event.percent,
            attempt,
          });
        },
        async () => {
          await this.assertActive(
            job,
            attempt,
            heartbeatStage,
            heartbeatPercent,
            controller.signal,
          );
        },
        async (artifacts, candidateCompletedAt) => {
          uploading = await this.results.beginUpload(
            job,
            attempt,
            provisional,
            artifacts,
            candidateCompletedAt,
          );
          return this.results.uploadCapabilities(
            uploading,
            this.config.getOrThrow('R_RUNTIME_OUTPUT_URL_TTL_SECONDS'),
          );
        },
      );
      await this.assertActive(
        job,
        attempt,
        'finalizing',
        98,
        controller.signal,
      );

      const outcome = await this.results.verifyAndPublish(
        job,
        attempt,
        uploading,
      );
      if (outcome === 'cancelled') {
        await this.lifecycle.finaliseCancellation(job.data.analysisId);
        await this.validation
          .acknowledge(job.data.analysisId)
          .catch(() => undefined);
      } else if (outcome === 'succeeded') {
        await this.validation
          .acknowledge(job.data.analysisId)
          .catch(() => undefined);
      }
    } catch (error) {
      if (
        error instanceof ExecutionCancelledError ||
        error instanceof RValidationCancelledError
      ) {
        return;
      }

      if (error instanceof ResultLifecycleError) {
        if (error.message === 'cancelled') {
          await this.lifecycle.finaliseCancellation(job.data.analysisId);
          return;
        }
        if (error.message === 'stale_attempt' || error.message === 'terminal') {
          return;
        }
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

  private eventStage(stage: string): AnalysisProgress['stage'] {
    const supported: AnalysisProgress['stage'][] = [
      'validating-inputs',
      'downloading',
      'parsing',
      'validating',
      'sampling-background',
      'training',
      'evaluating',
      'projecting',
      'writing-artifacts',
      'uploading-artifacts',
      'completed',
    ];
    return supported.includes(stage as AnalysisProgress['stage'])
      ? (stage as AnalysisProgress['stage'])
      : 'validating-inputs';
  }

  private async handleFailure(
    job: Job<AnalysisJobPayload>,
    attempt: number,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Execution failed.';
    const totalAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt =
      error instanceof ScientificValidationError ||
      job.attemptsMade + 1 >= totalAttempts;
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
        ? {
            code:
              error instanceof ScientificValidationError ||
              error instanceof RRuntimeError
                ? error.message
                : 'EXECUTION_FAILED',
            message: 'Analysis execution failed.',
          }
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
    await this.validation
      .acknowledge(job.data.analysisId)
      .catch(() => undefined);
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
}
