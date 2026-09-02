import { Injectable, type NestMiddleware } from '@nestjs/common';
import { resolveRequestId } from '@ecosuitability/runtime-utils';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';
import { normalizedRoute } from './normalized-route';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public constructor(private readonly requestContext: RequestContextService) {}

  public use(request: Request, response: Response, next: NextFunction): void {
    const incomingRequestId = request.header('x-request-id');
    const requestId = resolveRequestId(incomingRequestId);
    (request as Request & { id: string }).id = requestId;

    response.setHeader('X-Request-ID', requestId);
    response.once('finish', () => {
      this.requestContext.setRoute(normalizedRoute(request));
    });
    this.requestContext.run(
      { requestId, route: 'unmatched', method: request.method },
      next,
    );
  }
}
