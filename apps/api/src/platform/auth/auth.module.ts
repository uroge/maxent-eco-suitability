import { Module } from '@nestjs/common';
import { AuthenticationGuard } from './authentication.guard';
import { AUTHENTICATION_VERIFIER } from './authentication-verifier';
import { ClerkAuthenticationVerifier } from './clerk-authentication.verifier';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [
    ClerkAuthenticationVerifier,
    {
      provide: AUTHENTICATION_VERIFIER,
      useExisting: ClerkAuthenticationVerifier,
    },
    AuthenticationGuard,
    RolesGuard,
  ],
  exports: [AUTHENTICATION_VERIFIER, AuthenticationGuard, RolesGuard],
})
export class AuthModule {}
