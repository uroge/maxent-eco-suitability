import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import type { WorkerEnvironment } from '../env';
import { RedisService } from './redis.service';

@Controller()
export class OperationsController {
  private readonly registry = new Registry();

  public constructor(
    private readonly config: ConfigService<WorkerEnvironment, true>,
    private readonly redis: RedisService,
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
  public live(): { status: string; service: string } {
    return { status: 'ok', service: 'worker' };
  }

  @Get('health/ready')
  public async ready(): Promise<{ status: string; service: string }> {
    if (!(await this.redis.isReady())) {
      throw new ServiceUnavailableException(
        'Required dependencies are unavailable.',
      );
    }

    return { status: 'ok', service: 'worker' };
  }

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  public async metrics(@Req() request: Request): Promise<string> {
    if (!this.isAuthorized(request.header('authorization'))) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return this.registry.metrics();
  }

  private isAuthorized(authorization: string | undefined): boolean {
    const provided = Buffer.from(
      authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '',
    );
    const expected = Buffer.from(
      this.config.getOrThrow('WORKER_METRICS_TOKEN'),
    );

    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  }
}
