import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { AuthenticationVerifier } from './authentication-verifier';
import { AUTHENTICATION_VERIFIER } from './authentication-verifier';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  public constructor(
    @Inject(AUTHENTICATION_VERIFIER)
    private readonly verifier: AuthenticationVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.principal = await this.verifier.verify(
      request.header('authorization'),
    );
    return true;
  }
}
