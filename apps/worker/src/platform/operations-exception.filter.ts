import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ErrorEnvelope } from '@ecosuitability/contracts';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

const errorCodes = new Map<number, ErrorEnvelope['error']['code']>([
  [HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'DEPENDENCY_UNAVAILABLE'],
  [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
]);

const messages = new Map<number, string>([
  [HttpStatus.UNAUTHORIZED, 'Authentication is required.'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'Required dependencies are unavailable.'],
  [HttpStatus.NOT_FOUND, 'The requested resource was not found.'],
]);

@Catch()
export class OperationsExceptionFilter implements ExceptionFilter {
  public constructor(private readonly logger: Logger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = errorCodes.get(statusCode) ?? 'INTERNAL_ERROR';

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        { exception, requestId: request.id },
        'Unexpected operational request failure.',
      );
    }

    response.status(statusCode).json({
      error: {
        version: '1',
        code,
        message: messages.get(statusCode) ?? 'An unexpected error occurred.',
        requestId: request.id ?? 'unknown',
        details: null,
      },
    } satisfies ErrorEnvelope);
  }
}
