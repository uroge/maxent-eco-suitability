import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  analysisJobName,
  analysisInputProfileJobName,
  analysisPreflightJobName,
  analysisQueueName,
  type AnalysisJobPayload,
  type AnalysisValidationJobPayload,
} from '@ecosuitability/contracts';
import { withTimeout } from '@ecosuitability/runtime-utils';
import type { Queue } from 'bullmq';
import { Logger } from 'nestjs-pino';
import { createHash } from 'node:crypto';
import {
  AnalysisRepository,
  validationOutboxMember,
} from './analysis.repository';
import type { AnalysisOutbox, ValidationKind } from './analysis.types';

const reconcileIntervalMs = 5_000;

const dispatchTimeoutMs = 2_000;

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
      void this.reconcile().catch((error: unknown) => {
        this.logger.error({ error }, 'Analysis outbox reconciliation failed.');
      });
    }, reconcileIntervalMs);
  }

  public onApplicationShutdown(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  public async reconcile(now = new Date()): Promise<void> {
    for (const member of await withTimeout(
      this.repository.dueOutbox(now),
      dispatchTimeoutMs,
      'Outbox lookup timed out.',
    )) {
      await this.dispatchPending(member, now);
    }
  }

  public async dispatchValidation(
    analysisId: string,
    kind: ValidationKind,
  ): Promise<void> {
    await this.dispatchPending(
      validationOutboxMember(analysisId, kind),
      new Date(),
    );
  }

  private async dispatchPending(member: string, now: Date): Promise<void> {
    try {
      const outbox = await withTimeout(
        this.repository.claimOutbox(member, now),
        dispatchTimeoutMs,
        'Outbox claim timed out.',
      );
      if (outbox) {
        await withTimeout(
          this.dispatch(outbox),
          dispatchTimeoutMs,
          'Queue dispatch timed out.',
        );
        await withTimeout(
          this.repository.markOutboxDispatched(outbox),
          dispatchTimeoutMs,
          'Outbox acknowledgement timed out.',
        );
      }
    } catch (error) {
      this.logger.error(
        { error, member },
        'Analysis queue outbox dispatch failed.',
      );
    }
  }

  public async remove(analysisId: string): Promise<void> {
    const job = await this.queue.getJob(analysisId);
    if (job) {
      await job.remove();
    }
  }

  public async enqueueInputProfile(
    payload: AnalysisValidationJobPayload,
    requestCreatedAt: string,
  ): Promise<void> {
    await this.queue.add(analysisInputProfileJobName, payload, {
      jobId: this.validationJobId(
        `${payload.analysisId}-profile-${payload.inputRevision}`,
        requestCreatedAt,
      ),
      attempts: queueAttempts,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
    });
  }

  public async enqueuePreflight(
    payload: AnalysisValidationJobPayload,
    requestCreatedAt: string,
  ): Promise<void> {
    await this.queue.add(analysisPreflightJobName, payload, {
      jobId: this.validationJobId(
        `${payload.analysisId}-preflight-${payload.inputRevision}-${payload.configurationRevision}`,
        requestCreatedAt,
      ),
      attempts: queueAttempts,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 100 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
    });
  }

  private async dispatch(outbox: AnalysisOutbox): Promise<void> {
    if (outbox.validation) {
      const payload: AnalysisValidationJobPayload = {
        analysisId:
          outbox.analysisId as AnalysisValidationJobPayload['analysisId'],
        ownerId: outbox.ownerId,
        inputRevision: outbox.validation.inputRevision,
        configurationRevision: outbox.validation.configurationRevision,
      };
      if (outbox.validation.kind === 'inputProfile') {
        await this.enqueueInputProfile(payload, outbox.createdAt);
      } else {
        await this.enqueuePreflight(payload, outbox.createdAt);
      }
      return;
    }
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

  private validationJobId(prefix: string, requestCreatedAt: string): string {
    const requestId = createHash('sha256')
      .update(requestCreatedAt)
      .digest('hex')
      .slice(0, 16);
    return `${prefix}-${requestId}`;
  }
}
