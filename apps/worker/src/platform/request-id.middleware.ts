import { Injectable, type NestMiddleware } from '@nestjs/common';
import { resolveRequestId } from '@ecosuitability/runtime-utils';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId = resolveRequestId(incomingRequestId);

    (request as Request & { id: string }).id = requestId;
    response.setHeader('X-Request-ID', requestId);
    next();
  }
}
