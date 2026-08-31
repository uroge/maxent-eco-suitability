import { Injectable } from '@nestjs/common';
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';
import { RedisService } from '../redis/redis.service';

export type RateLimitScope =
  | 'anonymous'
  | 'authenticated-user'
  | 'authenticated-ip'
  | 'health'
  | 'metrics';

const rateLimitDefinitions: Record<
  RateLimitScope,
  { points: number; duration: number }
> = {
  anonymous: { points: 30, duration: 60 },
  'authenticated-user': { points: 120, duration: 60 },
  'authenticated-ip': { points: 240, duration: 60 },
  health: { points: 30, duration: 60 },
  metrics: { points: 10, duration: 60 },
};

@Injectable()
export class RateLimitService {
  private readonly limiters: Record<RateLimitScope, RateLimiterRedis>;

  public constructor(redis: RedisService) {
    this.limiters = Object.fromEntries(
      Object.entries(rateLimitDefinitions).map(([scope, definition]) => [
        scope,
        new RateLimiterRedis({
          storeClient: redis.getClient(),
          useRedisPackage: true,
          rejectIfRedisNotReady: true,
          keyPrefix: `ecosuitability:rate-limit:${scope}`,
          ...definition,
        }),
      ]),
    ) as Record<RateLimitScope, RateLimiterRedis>;
  }

  public async consume(scope: RateLimitScope, key: string): Promise<void> {
    await this.limiters[scope].consume(key);
  }

  public retryAfterSeconds(error: unknown): number {
    const result = error as Partial<RateLimiterRes>;
    return Math.max(1, Math.ceil((result.msBeforeNext ?? 1000) / 1000));
  }
}
