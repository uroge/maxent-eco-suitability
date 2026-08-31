import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  public constructor(private readonly metrics: MetricsService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    response.on('finish', () => {
      const route = request.route?.path
        ? String(request.route.path)
        : 'unmatched';
      this.metrics.httpRequests.inc({
        method: request.method,
        route,
        status: String(response.statusCode),
      });
    });
    next();
  }
}
