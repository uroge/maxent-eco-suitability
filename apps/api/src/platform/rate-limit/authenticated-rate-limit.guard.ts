import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { ApiException } from '../errors/api.exception';
import { normalizedClientIp } from './client-ip';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class AuthenticatedRateLimitGuard implements CanActivate {
  public constructor(private readonly rateLimit: RateLimitService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;

    if (!principal) {
      throw new ServiceUnavailableException(
        'Authentication context is unavailable.',
      );
    }

    try {
      await Promise.all([
        this.rateLimit.consume('authenticated-user', principal.userId),
        this.rateLimit.consume('authenticated-ip', normalizedClientIp(request)),
      ]);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new ServiceUnavailableException(
          'Required dependencies are unavailable.',
        );
      }

      const retryAfter = this.rateLimit.retryAfterSeconds(error);
      const response = context.switchToHttp().getResponse<Response>();

      if (retryAfter > 0) {
        response.setHeader('Retry-After', retryAfter);
        throw new ApiException(429, 'RATE_LIMITED', 'Too many requests.');
      }

      throw new ServiceUnavailableException(
        'Required dependencies are unavailable.',
      );
    }
  }
}
