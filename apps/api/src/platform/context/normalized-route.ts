import type { Request } from 'express';

export const normalizedRoute = (request: Request): string => {
  if (!request.route?.path) {
    return 'unmatched';
  }

  return `${request.baseUrl}${String(request.route.path)}`;
};
