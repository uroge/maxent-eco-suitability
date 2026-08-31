import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@ecosuitability/contracts';
import { ApiException } from '../errors/api.exception';
import type { AuthenticatedRequest } from './authenticated-request';
import { REQUIRED_ROLES } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal || !requiredRoles.includes(request.principal.role)) {
      throw new ApiException(
        403,
        'ACCESS_DENIED',
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
