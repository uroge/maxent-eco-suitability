import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiException } from '../errors/api.exception';
import { normalizedClientIp } from './client-ip';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class AnonymousRateLimitGuard implements CanActivate {
  public constructor(private readonly rateLimit: RateLimitService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();

    try {
      await this.rateLimit.consume('anonymous', normalizedClientIp(request));
      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new ServiceUnavailableException(
          'Required dependencies are unavailable.',
        );
      }

      response.setHeader(
        'Retry-After',
        this.rateLimit.retryAfterSeconds(error),
      );
      throw new ApiException(429, 'RATE_LIMITED', 'Too many requests.');
    }
  }
}
