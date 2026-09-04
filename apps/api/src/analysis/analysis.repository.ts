import { Injectable } from '@nestjs/common';
import { RedisService } from '../platform/redis/redis.service';
import {
  CreateAnalysisScript,
  ClaimCleanupScript,
  TransitionAnalysisScript,
  ScheduleCleanupScript,
  ClaimOutboxScript,
  DispatchOutboxScript,
  QueueAnalysisScript,
  UpdateConfigurationScript,
} from './analysis-scripts';
import type {
  CreateStoredAnalysisInput,
  CreateStoredAnalysisResult,
  StoredAnalysis,
  TransitionAnalysisInput,
  AnalysisOutbox,
} from './analysis.types';
import type { CleanupRecord } from '../storage/storage.types';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const idempotencyKeyPrefix = 'ecosuitability:analysis:idempotency:';

const expiryIndexKey = 'ecosuitability:analysis:expiry';

const tombstoneTtlSeconds = 60 * 60;

const analysisInputsKeyPrefix = 'ecosuitability:analysis-inputs:';

const cleanupKeyPrefix = 'ecosuitability:analysis-cleanup:';

const cleanupIndexKey = 'ecosuitability:analysis-cleanup:due';

const analysisSessionsKeyPrefix = 'ecosuitability:analysis-upload-sessions:';

const datasetKeyPrefix = 'ecosuitability:upload-dataset:';

const uploadKeyPrefix = 'ecosuitability:upload:';

const datasetIdempotencyKeyPrefix =
  'ecosuitability:upload-dataset:idempotency:';

const datasetExpiryIndexKey = 'ecosuitability:upload-dataset:expiry';

const outboxKeyPrefix = 'ecosuitability:analysis-outbox:';

const outboxIndexKey = 'ecosuitability:analysis-outbox:pending';

const resultKeyPrefix = 'ecosuitability:analysis-result-provisional:';

const configurationIdempotencyKeyPrefix =
  'ecosuitability:analysis-configuration:idempotency:';

@Injectable()
export class AnalysisRepository {
  public constructor(private readonly redis: RedisService) {}

  public async create(
    input: CreateStoredAnalysisInput,
    ttlSeconds: number,
  ): Promise<CreateStoredAnalysisResult | 'conflict'> {
    const result = (await this.redis.getClient().eval(CreateAnalysisScript, {
      keys: [
        analysisKeyPrefix,
        this.idempotencyKey(
          input.analysis.ownerId,
          input.analysis.idempotencyKey,
        ),
        expiryIndexKey,
      ],
      arguments: [
        input.analysis.id,
        input.fingerprint,
        JSON.stringify(input.analysis),
        String(ttlSeconds),
        String(new Date(input.analysis.expiresAt).getTime()),
      ],
    })) as string[];

    if (result[0] === 'conflict') {
      return 'conflict';
    }

    return {
      analysis: JSON.parse(result[1]) as StoredAnalysis,
      replayed: result[0] === 'replay',
    };
  }

  public async findOwned(
    analysisId: string,
    ownerId: string,
  ): Promise<StoredAnalysis | undefined> {
    const payload = await this.redis
      .getClient()
      .get(this.analysisKey(analysisId));

    if (!payload) {
      return undefined;
    }

    const analysis = JSON.parse(payload) as StoredAnalysis;
    return analysis.ownerId === ownerId ? analysis : undefined;
  }

  public async transition(
    input: TransitionAnalysisInput,
  ): Promise<StoredAnalysis | 'missing' | 'invalid'> {
    const result = (await this.redis
      .getClient()
      .eval(TransitionAnalysisScript, {
        keys: [this.analysisKey(input.analysisId)],
        arguments: [
          input.ownerId,
          JSON.stringify(input.expectedStatuses),
          input.status,
          new Date().toISOString(),
          JSON.stringify(input.failure ?? null),
        ],
      })) as string[];

    if (result[0] === 'missing' || result[0] === 'invalid') {
      return result[0];
    }

    return JSON.parse(result[1]) as StoredAnalysis;
  }

  public async queue(
    analysisId: string,
    ownerId: string,
    processingExpiresAt: Date,
  ): Promise<
    StoredAnalysis | 'missing' | 'invalid' | 'configuration_required'
  > {
    const now = new Date();
    const result = (await this.redis.getClient().eval(QueueAnalysisScript, {
      keys: [
        this.analysisKey(analysisId),
        this.outboxKey(analysisId),
        outboxIndexKey,
        `${resultKeyPrefix}${analysisId}`,
      ],
      arguments: [
        ownerId,
        analysisId,
        now.toISOString(),
        String(now.getTime()),
        processingExpiresAt.toISOString(),
      ],
    })) as string[];

    if (result[0] !== 'queued') {
      return result[0] as 'missing' | 'invalid' | 'configuration_required';
    }

    return JSON.parse(result[1]) as StoredAnalysis;
  }

  public async updateConfiguration(
    analysisId: string,
    ownerId: string,
    idempotencyKey: string,
    expectedRevision: number,
    configuration: StoredAnalysis['configuration'],
    fingerprint: string,
  ): Promise<StoredAnalysis | 'missing' | 'invalid' | 'conflict'> {
    const result = (await this.redis
      .getClient()
      .eval(UpdateConfigurationScript, {
        keys: [
          this.analysisKey(analysisId),
          `${configurationIdempotencyKeyPrefix}${ownerId}:${analysisId}:${idempotencyKey}`,
        ],
        arguments: [
          ownerId,
          String(expectedRevision),
          fingerprint,
          JSON.stringify(configuration),
          new Date().toISOString(),
        ],
      })) as string[];
    if (result[0] === 'idempotency_conflict') {
      return 'conflict';
    }
    if (result[0] !== 'updated' && result[0] !== 'replay') {
      return result[0] as 'missing' | 'invalid' | 'conflict';
    }
    return JSON.parse(result[1]) as StoredAnalysis;
  }

  public async dueOutbox(now: Date): Promise<string[]> {
    return this.redis
      .getClient()
      .zRangeByScore(outboxIndexKey, 0, now.getTime(), {
        LIMIT: { offset: 0, count: 100 },
      });
  }

  public async claimOutbox(
    analysisId: string,
    now: Date,
  ): Promise<AnalysisOutbox | undefined> {
    const leaseId = `outbox:${analysisId}:${now.getTime()}`;
    const leaseExpiresAt = new Date(now.getTime() + 30_000);
    const result = (await this.redis.getClient().eval(ClaimOutboxScript, {
      keys: [this.outboxKey(analysisId), outboxIndexKey],
      arguments: [
        analysisId,
        now.toISOString(),
        leaseId,
        leaseExpiresAt.toISOString(),
      ],
    })) as string[];

    return result[0] === 'claimed'
      ? (JSON.parse(result[1]) as AnalysisOutbox)
      : undefined;
  }

  public async markOutboxDispatched(outbox: AnalysisOutbox): Promise<void> {
    const now = new Date();
    await this.redis.getClient().eval(DispatchOutboxScript, {
      keys: [
        this.outboxKey(outbox.analysisId),
        this.analysisKey(outbox.analysisId),
        outboxIndexKey,
      ],
      arguments: [outbox.leaseId ?? '', now.toISOString(), outbox.analysisId],
    });
  }

  public async expireDue(now: Date): Promise<void> {
    const analysisIds = await this.redis
      .getClient()
      .zRangeByScore(expiryIndexKey, 0, now.getTime(), {
        LIMIT: { offset: 0, count: 100 },
      });

    await Promise.all(
      analysisIds.map(async (analysisId) => {
        const payload = await this.redis
          .getClient()
          .get(this.analysisKey(analysisId));

        if (!payload) {
          await this.redis.getClient().zRem(expiryIndexKey, analysisId);
          return;
        }

        const analysis = JSON.parse(payload) as StoredAnalysis;
        if (
          ![
            'draft',
            'uploading',
            'ready',
            'queued',
            'running',
            'succeeded',
          ].includes(analysis.status)
        ) {
          return;
        }

        await this.scheduleCleanup(
          analysisId,
          analysis.ownerId,
          ['draft', 'uploading', 'ready', 'queued', 'running', 'succeeded'],
          'expired',
          now,
        );
      }),
    );
  }

  public async cancel(
    analysisId: string,
    ownerId: string,
  ): Promise<StoredAnalysis | 'missing' | 'invalid'> {
    const existing = await this.findOwned(analysisId, ownerId);
    if (!existing) {
      return 'missing';
    }

    if (existing.status === 'running') {
      return this.transition({
        analysisId,
        ownerId,
        expectedStatuses: ['running'],
        status: 'cancelling',
        failure: null,
      });
    }

    return this.scheduleCleanup(
      analysisId,
      ownerId,
      ['draft', 'uploading', 'ready', 'queued', 'cancelling'],
      'cancelled',
      new Date(),
    );
  }

  public async dueCleanup(now: Date): Promise<CleanupRecord[]> {
    const ids = await this.redis
      .getClient()
      .zRangeByScore(cleanupIndexKey, 0, now.getTime(), {
        LIMIT: { offset: 0, count: 100 },
      });
    const records = await Promise.all(
      ids.map(async (id) => {
        const payload = await this.redis.getClient().get(this.cleanupKey(id));
        return payload ? (JSON.parse(payload) as CleanupRecord) : undefined;
      }),
    );
    return records.filter((record): record is CleanupRecord => Boolean(record));
  }

  public async completeCleanup(cleanupId: string): Promise<void> {
    await this.redis
      .getClient()
      .multi()
      .del(this.cleanupKey(cleanupId))
      .zRem(cleanupIndexKey, cleanupId)
      .exec();
  }

  public async claimCleanup(
    cleanupId: string,
    now: Date,
  ): Promise<CleanupRecord | undefined> {
    const claimExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    const result = (await this.redis.getClient().eval(ClaimCleanupScript, {
      keys: [this.cleanupKey(cleanupId), cleanupIndexKey],
      arguments: [
        cleanupId,
        now.toISOString(),
        `${cleanupId}:${now.getTime()}`,
        claimExpiresAt.toISOString(),
      ],
    })) as string[];
    return result[1] ? (JSON.parse(result[1]) as CleanupRecord) : undefined;
  }

  public async retryCleanup(record: CleanupRecord, now: Date): Promise<void> {
    const attempt = record.attempt + 1;
    const nextAttemptAt = new Date(
      now.getTime() + Math.min(60_000 * 2 ** attempt, 3_600_000),
    );
    const next: CleanupRecord = {
      ...record,
      attempt,
      nextAttemptAt: nextAttemptAt.toISOString(),
    };
    await this.redis
      .getClient()
      .multi()
      .set(this.cleanupKey(record.id), JSON.stringify(next))
      .zAdd(cleanupIndexKey, {
        score: nextAttemptAt.getTime(),
        value: record.id,
      })
      .exec();
  }

  private async scheduleCleanup(
    analysisId: string,
    ownerId: string,
    expectedStatuses: StoredAnalysis['status'][],
    status: 'cancelled' | 'expired',
    now: Date,
  ): Promise<StoredAnalysis | 'missing' | 'invalid'> {
    const cleanupId = `cl_${analysisId}`;
    const result = (await this.redis.getClient().eval(ScheduleCleanupScript, {
      keys: [
        this.analysisKey(analysisId),
        this.analysisInputsKey(analysisId),
        this.cleanupKey(cleanupId),
        cleanupIndexKey,
        expiryIndexKey,
        idempotencyKeyPrefix,
        this.analysisSessionsKey(analysisId),
        datasetKeyPrefix,
        uploadKeyPrefix,
        datasetIdempotencyKeyPrefix,
        datasetExpiryIndexKey,
        this.outboxKey(analysisId),
        outboxIndexKey,
        `${resultKeyPrefix}${analysisId}`,
      ],
      arguments: [
        ownerId,
        JSON.stringify(expectedStatuses),
        cleanupId,
        now.toISOString(),
        String(now.getTime()),
        status,
        String(tombstoneTtlSeconds),
      ],
    })) as string[];

    if (result[0] !== 'scheduled') {
      return result[0] as 'missing' | 'invalid';
    }

    return JSON.parse(result[1]) as StoredAnalysis;
  }

  private analysisKey(analysisId: string): string {
    return `${analysisKeyPrefix}${analysisId}`;
  }

  private idempotencyKey(ownerId: string, key: string): string {
    return `${idempotencyKeyPrefix}${ownerId}:${key}`;
  }

  private analysisInputsKey(analysisId: string): string {
    return `${analysisInputsKeyPrefix}${analysisId}`;
  }

  private cleanupKey(cleanupId: string): string {
    return `${cleanupKeyPrefix}${cleanupId}`;
  }

  private outboxKey(analysisId: string): string {
    return `${outboxKeyPrefix}${analysisId}`;
  }

  private analysisSessionsKey(analysisId: string): string {
    return `${analysisSessionsKeyPrefix}${analysisId}`;
  }
}
