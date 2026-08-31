import { Controller, Get, Header, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Req } from '@nestjs/common';
import type { ApiEnvironment } from '../../env';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  public constructor(
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly metrics: MetricsService,
  ) {}

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  public async getMetrics(@Req() request: Request): Promise<string> {
    if (!this.isAuthorized(request.header('authorization'))) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return this.metrics.metrics();
  }

  private isAuthorized(authorization: string | undefined): boolean {
    const provided = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    const expected = this.config.getOrThrow('METRICS_TOKEN');
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }
}
