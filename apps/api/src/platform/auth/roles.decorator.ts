import { SetMetadata } from '@nestjs/common';
import type { Role } from '@ecosuitability/contracts';

export const REQUIRED_ROLES = 'requiredRoles';

export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);
