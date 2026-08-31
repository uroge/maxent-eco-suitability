import { Injectable } from '@nestjs/common';
import { RedisService } from '../platform/redis/redis.service';
import {
  CreateAnalysisScript,
  ExpireAnalysisScript,
  TransitionAnalysisScript,
} from './analysis-scripts';
import type {
  CreateStoredAnalysisInput,
  CreateStoredAnalysisResult,
  StoredAnalysis,
  TransitionAnalysisInput,
} from './analysis.types';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const idempotencyKeyPrefix = 'ecosuitability:analysis:idempotency:';

const expiryIndexKey = 'ecosuitability:analysis:expiry';

const tombstoneTtlSeconds = 60 * 60;

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
        String(ttlSeconds + tombstoneTtlSeconds),
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
        await this.redis.getClient().eval(ExpireAnalysisScript, {
          keys: [
            this.analysisKey(analysisId),
            expiryIndexKey,
            this.idempotencyKey(analysis.ownerId, analysis.idempotencyKey),
          ],
          arguments: [
            analysisId,
            now.toISOString(),
            String(tombstoneTtlSeconds),
          ],
        });
      }),
    );
  }

  private analysisKey(analysisId: string): string {
    return `${analysisKeyPrefix}${analysisId}`;
  }

  private idempotencyKey(ownerId: string, key: string): string {
    return `${idempotencyKeyPrefix}${ownerId}:${key}`;
  }
}
