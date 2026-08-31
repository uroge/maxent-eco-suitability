import {
  Injectable,
  type NestMiddleware,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiException } from '../errors/api.exception';
import { normalizedClientIp } from './client-ip';
import { RateLimitService, type RateLimitScope } from './rate-limit.service';

@Injectable()
export class GlobalRateLimitMiddleware implements NestMiddleware {
  public constructor(private readonly rateLimit: RateLimitService) {}

  public async use(
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> {
    const scope = this.scopeForPath(request.path);

    try {
      await this.rateLimit.consume(scope, normalizedClientIp(request));
      next();
    } catch (error) {
      if (error instanceof Error) {
        if (scope === 'health' && request.path.endsWith('/live')) {
          next();
          return;
        }

        next(
          new ServiceUnavailableException(
            'Required dependencies are unavailable.',
          ),
        );
        return;
      }

      if (scope === 'health' && request.path.endsWith('/live')) {
        next();
        return;
      }

      response.setHeader(
        'Retry-After',
        this.rateLimit.retryAfterSeconds(error),
      );
      next(new ApiException(429, 'RATE_LIMITED', 'Too many requests.'));
    }
  }

  private scopeForPath(path: string): RateLimitScope {
    if (path.startsWith('/health')) {
      return 'health';
    }

    if (path === '/metrics') {
      return 'metrics';
    }

    return 'anonymous';
  }
}
