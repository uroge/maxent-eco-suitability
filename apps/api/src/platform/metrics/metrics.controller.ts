import {
  Controller,
  Get,
  Header,
  Res,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constantTimeBearerTokenEquals } from '@ecosuitability/runtime-utils';
import type { Request, Response } from 'express';
import { Req } from '@nestjs/common';
import type { ApiEnvironment } from '../../env';
import { MetricsService } from './metrics.service';

@Controller({ version: VERSION_NEUTRAL })
export class MetricsController {
  public constructor(
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly metrics: MetricsService,
  ) {}

  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  public async getMetrics(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    if (!this.isAuthorized(request.header('authorization'))) {
      throw new UnauthorizedException('Authentication is required.');
    }

    response.type(this.metrics.contentType());
    return this.metrics.metrics();
  }

  private isAuthorized(authorization: string | undefined): boolean {
    return constantTimeBearerTokenEquals(
      authorization,
      this.config.getOrThrow('METRICS_TOKEN'),
    );
  }
}
