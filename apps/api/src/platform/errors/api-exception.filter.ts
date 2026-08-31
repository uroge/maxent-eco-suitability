import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ErrorEnvelope, ErrorDetails } from '@ecosuitability/contracts';
import type { Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { ApiException } from './api.exception';

const statusCodeToErrorCode = new Map<number, ErrorEnvelope['error']['code']>([
  [HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
  [HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED'],
  [HttpStatus.FORBIDDEN, 'ACCESS_DENIED'],
  [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(private readonly requestContext: RequestContextService) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId =
      this.requestContext.get()?.requestId ??
      String(response.getHeader('X-Request-ID') ?? 'unknown');
    const responseDefinition = this.toResponse(exception, requestId);

    response
      .status(responseDefinition.statusCode)
      .json(responseDefinition.body);
  }

  private toResponse(
    exception: unknown,
    requestId: string,
  ): { statusCode: number; body: ErrorEnvelope } {
    if (exception instanceof ApiException) {
      return {
        statusCode: exception.statusCode,
        body: this.envelope(
          exception.code,
          exception.message,
          requestId,
          exception.details,
        ),
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const code = statusCodeToErrorCode.get(statusCode) ?? 'INTERNAL_ERROR';
      const details =
        statusCode === HttpStatus.BAD_REQUEST
          ? this.validationDetails(exception.getResponse())
          : null;
      const message =
        code === 'INTERNAL_ERROR'
          ? 'An unexpected error occurred.'
          : exception.message;

      return {
        statusCode,
        body: this.envelope(code, message, requestId, details),
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      body: this.envelope(
        'INTERNAL_ERROR',
        'An unexpected error occurred.',
        requestId,
        null,
      ),
    };
  }

  private envelope(
    code: ErrorEnvelope['error']['code'],
    message: string,
    requestId: string,
    details: ErrorDetails,
  ): ErrorEnvelope {
    return { error: { version: '1', code, message, requestId, details } };
  }

  private validationDetails(response: string | object): ErrorDetails {
    if (typeof response !== 'object' || response === null) {
      return null;
    }

    const messages = Reflect.get(response, 'message');
    if (!Array.isArray(messages)) {
      return null;
    }

    return {
      fields: messages
        .slice(0, 32)
        .map(() => ({ field: 'request', code: 'INVALID' })),
    };
  }
}
