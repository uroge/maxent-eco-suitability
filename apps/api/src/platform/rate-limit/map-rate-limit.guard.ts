import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { ApiException } from '../errors/api.exception';
import { normalizedClientIp } from './client-ip';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class MapRateLimitGuard implements CanActivate {
  public constructor(private readonly rateLimit: RateLimitService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new ServiceUnavailableException(
        'Authentication context is unavailable.',
      );
    }

    try {
      await Promise.all([
        this.rateLimit.consume('map-user', request.principal.userId),
        this.rateLimit.consume('map-ip', normalizedClientIp(request)),
      ]);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new ServiceUnavailableException(
          'Required dependencies are unavailable.',
        );
      }

      const response = context.switchToHttp().getResponse<Response>();
      response.setHeader(
        'Retry-After',
        this.rateLimit.retryAfterSeconds(error),
      );
      throw new ApiException(429, 'RATE_LIMITED', 'Too many map requests.');
    }
  }
}
