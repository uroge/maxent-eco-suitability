import { describe, expect, it, vi } from 'vitest';
import { ClerkAuthenticationVerifier } from './clerk-authentication.verifier';

const config = {
  getOrThrow: (key: string) => {
    const values: Record<string, string | string[]> = {
      CLERK_SECRET_KEY: 'sk_test_example',
      CLERK_PUBLISHABLE_KEY: 'pk_test_example',
      CLERK_AUTHORIZED_PARTIES: ['http://localhost:3000'],
    };

    return values[key]!;
  },
};

const authenticatedState = (role: unknown) => ({
  isAuthenticated: true,
  toAuth: () => ({
    userId: 'user_123',
    sessionId: 'sess_123',
    sessionStatus: 'active',
    sessionClaims: { metadata: { role } },
  }),
});

describe('ClerkAuthenticationVerifier', () => {
  it('accepts only an exact admin role and passes configured authorized parties', async () => {
    const verifier = new ClerkAuthenticationVerifier(config as never);
    const authenticateRequest = vi
      .fn()
      .mockResolvedValue(authenticatedState('admin'));
    (
      verifier as unknown as {
        clerk: { authenticateRequest: typeof authenticateRequest };
      }
    ).clerk = {
      authenticateRequest,
    };

    await expect(verifier.verify('Bearer token')).resolves.toEqual({
      userId: 'user_123',
      sessionId: 'sess_123',
      role: 'admin',
    });
    expect(authenticateRequest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({
        acceptsToken: 'session_token',
        authorizedParties: ['http://localhost:3000'],
      }),
    );
  });

  it.each([undefined, 'Admin', 'administrator', {}, []])(
    'falls back to user for a malformed role claim',
    async (role) => {
      const verifier = new ClerkAuthenticationVerifier(config as never);
      const authenticateRequest = vi
        .fn()
        .mockResolvedValue(authenticatedState(role));
      (
        verifier as unknown as {
          clerk: { authenticateRequest: typeof authenticateRequest };
        }
      ).clerk = {
        authenticateRequest,
      };

      await expect(verifier.verify('Bearer token')).resolves.toMatchObject({
        role: 'user',
      });
    },
  );

  it.each([
    ['missing token', undefined],
    ['malformed token', 'Basic token'],
    ['rejected token', 'Bearer token'],
  ])(
    'rejects %s with the standard authentication error',
    async (_case, header) => {
      const verifier = new ClerkAuthenticationVerifier(config as never);
      const authenticateRequest = vi
        .fn()
        .mockResolvedValue({ isAuthenticated: false });
      (
        verifier as unknown as {
          clerk: { authenticateRequest: typeof authenticateRequest };
        }
      ).clerk = {
        authenticateRequest,
      };

      await expect(verifier.verify(header)).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
    },
  );
});
