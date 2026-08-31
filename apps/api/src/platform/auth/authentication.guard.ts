import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticationVerifier } from './authentication-verifier';
import { AUTHENTICATION_VERIFIER } from './authentication-verifier';
import type { AuthenticatedRequest } from './authenticated-request';
import { ApiException } from '../errors/api.exception';
import { normalizedClientIp } from '../rate-limit/client-ip';
import { RateLimitService } from '../rate-limit/rate-limit.service';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(
    @Inject(AUTHENTICATION_VERIFIER)
    private readonly verifier: AuthenticationVerifier,
    private readonly rateLimit: RateLimitService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    try {
      request.principal = await this.verifier.verify(
        request.header('authorization'),
      );
      return true;
    } catch (error) {
      await this.limitAuthenticationFailure(context, request);
      throw error;
    }
  }

  private async limitAuthenticationFailure(
    context: ExecutionContext,
    request: AuthenticatedRequest,
  ): Promise<void> {
    try {
      await this.rateLimit.consume(
        'authentication-failure',
        normalizedClientIp(request),
      );
    } catch (error) {
      const response = context.switchToHttp().getResponse<Response>();

      if (error instanceof Error) {
        throw new ApiException(
          503,
          'DEPENDENCY_UNAVAILABLE',
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
