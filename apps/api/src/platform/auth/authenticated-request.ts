import type { Principal } from '@ecosuitability/contracts';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { principal?: Principal };
