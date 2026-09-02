import {
  Controller,
  Get,
  Header,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constantTimeBearerTokenEquals } from '@ecosuitability/runtime-utils';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';
import { Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { WorkerEnvironment } from '../env';
import type { HealthResponse } from '@ecosuitability/contracts';
import { LifecycleService } from './lifecycle.service';
import { RedisService } from './redis.service';

@Controller()
export class OperationsController {
  private readonly registry = new Registry();

  public constructor(
    private readonly config: ConfigService<WorkerEnvironment, true>,
    private readonly redis: RedisService,
    private readonly lifecycle: LifecycleService,
  ) {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'ecosuitability_worker_',
    });
    new Counter({
      name: 'ecosuitability_worker_operational_requests_total',
      help: 'Operational requests served by the worker.',
      labelNames: ['route', 'status'] as const,
      registers: [this.registry],
    });
  }

  @Get('health/live')
  public live(@Req() request: Request & { id?: string }): HealthResponse {
    return {
      status: 'ok',
      service: 'worker',
      requestId: request.id ?? 'unknown',
    };
  }

  @Get('health/ready')
  public async ready(
    @Req() request: Request & { id?: string },
  ): Promise<HealthResponse> {
    if (!this.lifecycle.isReady() || !(await this.redis.isReady())) {
      throw new ServiceUnavailableException(
        'Required dependencies are unavailable.',
      );
    }

    return {
      status: 'ok',
      service: 'worker',
      requestId: request.id ?? 'unknown',
    };
  }

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  public async metrics(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    if (!this.isAuthorized(request.header('authorization'))) {
      throw new UnauthorizedException('Authentication is required.');
    }

    response.type(this.registry.contentType);
    return this.registry.metrics();
  }

  private isAuthorized(authorization: string | undefined): boolean {
    return constantTimeBearerTokenEquals(
      authorization,
      this.config.getOrThrow('WORKER_METRICS_TOKEN'),
    );
  }
}
