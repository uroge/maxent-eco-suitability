import { Injectable } from '@nestjs/common';
import { RedisService } from '../platform/redis/redis.service';
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

const createScript = `
local existing = redis.call('GET', KEYS[2])
if existing then
  local idempotency = cjson.decode(existing)
  if idempotency.fingerprint == ARGV[2] then
    local analysis = redis.call('GET', KEYS[1] .. idempotency.analysisId)
    if analysis then
      return { 'replay', analysis }
    end
  end
  return { 'conflict' }
end

redis.call('SET', KEYS[1] .. ARGV[1], ARGV[3], 'EX', ARGV[4])
redis.call('SET', KEYS[2], cjson.encode({ analysisId = ARGV[1], fingerprint = ARGV[2] }), 'EX', ARGV[4])
redis.call('ZADD', KEYS[3], ARGV[5], ARGV[1])
return { 'created', ARGV[3] }
`;

const transitionScript = `
local payload = redis.call('GET', KEYS[1])
if not payload then
  return { 'missing' }
end

local analysis = cjson.decode(payload)
if analysis.ownerId ~= ARGV[1] then
  return { 'missing' }
end

local allowed = cjson.decode(ARGV[2])
local matches = false
for _, status in ipairs(allowed) do
  if analysis.status == status then
    matches = true
    break
  end
end

if not matches then
  return { 'invalid', analysis.status }
end

analysis.status = ARGV[3]
analysis.updatedAt = ARGV[4]
analysis.failure = cjson.decode(ARGV[5])
redis.call('SET', KEYS[1], cjson.encode(analysis), 'KEEPTTL')
return { 'updated', cjson.encode(analysis) }
`;

const expireScript = `
local payload = redis.call('GET', KEYS[1])
if not payload then
  redis.call('ZREM', KEYS[2], ARGV[1])
  return { 'missing' }
end

local analysis = cjson.decode(payload)
if analysis.expiresAt > ARGV[2] then
  return { 'not_due' }
end

if analysis.status == 'expired' then
  return { 'expired' }
end

analysis.status = 'expired'
analysis.updatedAt = ARGV[2]
analysis.expiredAt = ARGV[2]
analysis.failure = cjson.null
redis.call('SET', KEYS[1], cjson.encode(analysis), 'EX', ARGV[3])
redis.call('DEL', KEYS[3])
redis.call('ZREM', KEYS[2], ARGV[1])
return { 'expired' }
`;

@Injectable()
export class AnalysisRepository {
  public constructor(private readonly redis: RedisService) {}

  public async create(
    input: CreateStoredAnalysisInput,
    ttlSeconds: number,
  ): Promise<CreateStoredAnalysisResult | 'conflict'> {
    const result = (await this.redis.getClient().eval(createScript, {
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
    const result = (await this.redis.getClient().eval(transitionScript, {
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
        await this.redis.getClient().eval(expireScript, {
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
