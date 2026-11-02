import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { IdempotencyKey, Principal } from '@ecosuitability/contracts';
import { canonicalizeJson } from '@ecosuitability/runtime-utils';
import { RedisService } from '../platform/redis/redis.service';
import { ApiException } from '../platform/errors/api.exception';
import {
  ClaimOperationScript,
  CompleteOperationScript,
  ReleaseOperationScript,
} from './analysis-scripts';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const operationKeyPrefix = 'ecosuitability:analysis-operation:';

const operationIndexPrefix = 'ecosuitability:analysis-operations:';

@Injectable()
export class OperationIdempotencyService {
  public constructor(private readonly redis: RedisService) {}

  public async execute<T>(
    principal: Principal,
    analysisId: string,
    key: IdempotencyKey,
    operation: string,
    payload: unknown,
    handler: () => Promise<T>,
  ): Promise<T> {
    const claimId = randomUUID();
    const now = Date.now();
    const operationKey = `${operationKeyPrefix}${principal.userId}:${analysisId}:${key}`;
    const indexKey = `${operationIndexPrefix}${analysisId}`;
    const fingerprint = createHash('sha256')
      .update(canonicalizeJson({ operation, analysisId, payload }))
      .digest('hex');
    const result = (await this.redis.getClient().eval(ClaimOperationScript, {
      keys: [`${analysisKeyPrefix}${analysisId}`, operationKey, indexKey],
      arguments: [
        principal.userId,
        fingerprint,
        operation,
        claimId,
        String(now),
        String(now + 30_000),
        new Date(now).toISOString(),
      ],
    })) as string[];

    if (result[0] === 'missing') {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'The requested resource was not found.',
      );
    }
    if (result[0] === 'conflict') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The idempotency key was already used for a different request.',
      );
    }
    if (result[0] === 'pending') {
      throw new ApiException(
        409,
        'CONFLICT',
        'The operation is already in progress. Retry with the same key.',
      );
    }
    if (result[0] === 'replay') {
      return JSON.parse(result[1] ?? 'null') as T;
    }

    try {
      const value = await handler();
      const completion = (await this.redis
        .getClient()
        .eval(CompleteOperationScript, {
          keys: [operationKey],
          arguments: [
            claimId,
            JSON.stringify(value ?? null),
            new Date().toISOString(),
          ],
        })) as string[];
      if (completion[0] !== 'completed') {
        throw new ApiException(
          409,
          'CONFLICT',
          'The idempotent operation lease expired. Retry with the same key.',
        );
      }
      return value;
    } catch (error) {
      await this.redis.getClient().eval(ReleaseOperationScript, {
        keys: [operationKey, indexKey],
        arguments: [claimId],
      });
      throw error;
    }
  }
}
