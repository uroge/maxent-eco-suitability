import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId =
      incomingRequestId && requestIdPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    (request as Request & { id: string }).id = requestId;
    response.setHeader('X-Request-ID', requestId);
    next();
  }
}
