import type { Principal } from '@ecosuitability/contracts';

export const AUTHENTICATION_VERIFIER = Symbol('AUTHENTICATION_VERIFIER');

export type AuthenticationVerifier = {
  verify(authorizationHeader: string | undefined): Promise<Principal>;
};
