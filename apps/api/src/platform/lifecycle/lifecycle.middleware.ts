import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { LifecycleService } from './lifecycle.service';

@Injectable()
export class LifecycleMiddleware implements NestMiddleware {
  public constructor(private readonly lifecycle: LifecycleService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    if (request.path === '/health/live') {
      next();
      return;
    }

    if (!this.lifecycle.beginRequest()) {
      response.status(503).json({
        error: {
          version: '1',
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Service is shutting down.',
          requestId: response.getHeader('X-Request-ID') ?? 'unknown',
          details: null,
        },
      });
      return;
    }

    let completed = false;
    const complete = (): void => {
      if (!completed) {
        completed = true;
        this.lifecycle.endRequest();
      }
    };

    response.once('finish', complete);
    response.once('close', complete);
    next();
  }
}
