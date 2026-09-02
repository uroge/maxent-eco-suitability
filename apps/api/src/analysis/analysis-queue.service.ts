import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  analysisJobName,
  analysisQueueName,
  type AnalysisJobPayload,
} from '@ecosuitability/contracts';
import type { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { AnalysisRepository } from './analysis.repository';
import type { AnalysisOutbox } from './analysis.types';

const reconcileIntervalMs = 5_000;

const queueAttempts = 3;

@Injectable()
export class AnalysisQueueService
  implements OnModuleInit, OnApplicationShutdown
{
  private interval: NodeJS.Timeout | undefined;

  public constructor(
    @InjectQueue(analysisQueueName) private readonly queue: Queue,
    private readonly repository: AnalysisRepository,
    private readonly logger: Logger,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.queue.setGlobalConcurrency(1);
    await this.reconcile();
    this.interval = setInterval(() => {
      void this.reconcile();
    }, reconcileIntervalMs);
  }

  public onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  public async reconcile(now = new Date()): Promise<void> {
    const analysisIds = await this.repository.dueOutbox(now);

    for (const analysisId of analysisIds) {
      const outbox = await this.repository.claimOutbox(analysisId, now);
      if (!outbox) {
        continue;
      }

      try {
        await this.dispatch(outbox);
        await this.repository.markOutboxDispatched(outbox);
      } catch (error) {
        this.logger.error(
          { error, analysisId },
          'Analysis queue outbox dispatch failed.',
        );
      }
    }
  }

  public async remove(analysisId: string): Promise<void> {
    const job = await this.queue.getJob(analysisId);
    if (job) {
      await job.remove();
    }
  }

  private async dispatch(outbox: AnalysisOutbox): Promise<void> {
    const payload: AnalysisJobPayload = {
      analysisId: outbox.analysisId as AnalysisJobPayload['analysisId'],
      ownerId: outbox.ownerId,
    };
    await this.queue.add(analysisJobName, payload, {
      jobId: outbox.jobId,
      attempts: queueAttempts,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
    });
  }
}
