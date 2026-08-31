import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';
import { normalizedRoute } from '../context/normalized-route';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  public constructor(private readonly metrics: MetricsService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    response.on('finish', () => {
      this.metrics.httpRequests.inc({
        method: request.method,
        route: normalizedRoute(request),
        status: String(response.statusCode),
      });
    });
    next();
  }
}
