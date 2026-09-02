import { createClerkClient } from '@clerk/backend';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Principal } from '@ecosuitability/contracts';
import { withTimeout } from '@ecosuitability/runtime-utils';
import type { ApiEnvironment } from '../../env';
import { ApiException } from '../errors/api.exception';
import type { AuthenticationVerifier } from './authentication-verifier';

const authenticationTimeoutMs = 5000;

@Injectable()
export class ClerkAuthenticationVerifier implements AuthenticationVerifier {
  private readonly clerk;

  public constructor(
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {
    this.clerk = createClerkClient({
      secretKey: config.getOrThrow('CLERK_SECRET_KEY'),
      publishableKey: config.getOrThrow('CLERK_PUBLISHABLE_KEY'),
    });
  }

  public async verify(
    authorizationHeader: string | undefined,
  ): Promise<Principal> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw this.authenticationRequired();
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();
    if (!token || token.includes(' ')) {
      throw this.authenticationRequired();
    }

    try {
      const request = new Request('https://api.internal/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const state = await withTimeout(
        this.clerk.authenticateRequest(request, {
          acceptsToken: 'session_token',
          authorizedParties: this.config.getOrThrow('CLERK_AUTHORIZED_PARTIES'),
        }),
        authenticationTimeoutMs,
        'Clerk authentication timed out.',
      );

      if (!state.isAuthenticated) {
        throw this.authenticationRequired();
      }

      const auth = state.toAuth();
      if (!auth.userId || !auth.sessionId || auth.sessionStatus !== 'active') {
        throw this.authenticationRequired();
      }

      return {
        userId: auth.userId,
        sessionId: auth.sessionId,
        role: this.resolveRole(auth.sessionClaims),
      };
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }

      throw this.authenticationRequired();
    }
  }

  private resolveRole(claims: unknown): Principal['role'] {
    if (typeof claims !== 'object' || claims === null) {
      return 'user';
    }

    const metadata = Reflect.get(claims, 'metadata');
    return typeof metadata === 'object' &&
      metadata !== null &&
      Reflect.get(metadata, 'role') === 'admin'
      ? 'admin'
      : 'user';
  }

  private authenticationRequired(): ApiException {
    return new ApiException(
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication is required.',
    );
  }
}
