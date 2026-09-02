import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { HealthCheckError, HealthCheckService } from '@nestjs/terminus';
import type { HealthResponse } from '@ecosuitability/contracts';
import { RequestContextService } from '../context/request-context.service';
import { RedisService } from '../redis/redis.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { StorageService } from '../../storage/storage.service';

@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  public constructor(
    private readonly redis: RedisService,
    private readonly requestContext: RequestContextService,
    private readonly lifecycle: LifecycleService,
    private readonly health: HealthCheckService,
    private readonly storage: StorageService,
  ) {}

  @Get('live')
  public live(): HealthResponse {
    return this.response('ok');
  }

  @Get('ready')
  public async ready(): Promise<HealthResponse> {
    try {
      await this.health.check([
        async () => this.redisHealth(),
        async () => this.storageHealth(),
      ]);
    } catch {
      throw new ServiceUnavailableException(
        'Required dependencies are unavailable.',
      );
    }

    return this.response('ok');
  }

  private async redisHealth(): Promise<{ redis: { status: 'up' } }> {
    if (!this.lifecycle.isReady() || !(await this.redis.isReady())) {
      throw new HealthCheckError('Redis is unavailable.', {
        redis: { status: 'down' },
      });
    }

    return { redis: { status: 'up' } };
  }

  private async storageHealth(): Promise<{ storage: { status: 'up' } }> {
    if (!(await this.storage.isReady())) {
      throw new HealthCheckError('Storage is unavailable.', {
        storage: { status: 'down' },
      });
    }

    return { storage: { status: 'up' } };
  }

  private response(status: HealthResponse['status']): HealthResponse {
    return {
      status,
      service: 'api',
      requestId: this.requestContext.get()?.requestId ?? 'unknown',
    };
  }
}
