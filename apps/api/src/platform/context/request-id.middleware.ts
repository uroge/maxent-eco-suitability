import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public constructor(private readonly requestContext: RequestContextService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId =
      incomingRequestId && requestIdPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();
    const route = request.route?.path
      ? String(request.route.path)
      : 'unmatched';

    response.setHeader('X-Request-ID', requestId);
    this.requestContext.run({ requestId, route, method: request.method }, next);
  }
}
