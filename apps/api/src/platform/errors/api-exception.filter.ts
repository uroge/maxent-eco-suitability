import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { ErrorEnvelope, ErrorDetails } from '@ecosuitability/contracts';
import type { Response } from 'express';
import { RequestContextService } from '../context/request-context.service';
import { ApiException } from './api.exception';

const statusCodeToErrorCode = new Map<number, ErrorEnvelope['error']['code']>([
  [HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'],
  [HttpStatus.CONFLICT, 'CONFLICT'],
  [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
  [HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED'],
  [HttpStatus.FORBIDDEN, 'ACCESS_DENIED'],
  [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'DEPENDENCY_UNAVAILABLE'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'VALIDATION_FAILED'],
]);

const safeMessages = new Map<number, string>([
  [HttpStatus.BAD_REQUEST, 'The request is invalid.'],
  [
    HttpStatus.CONFLICT,
    'The request conflicts with the current resource state.',
  ],
  [HttpStatus.NOT_FOUND, 'The requested resource was not found.'],
  [HttpStatus.UNAUTHORIZED, 'Authentication is required.'],
  [HttpStatus.FORBIDDEN, 'You do not have permission to perform this action.'],
  [HttpStatus.TOO_MANY_REQUESTS, 'Too many requests.'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'The request payload is too large.'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'Required dependencies are unavailable.'],
]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: Logger,
  ) {}

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
      return this.httpExceptionResponse(
        exception.getStatus(),
        requestId,
        exception.getResponse(),
      );
    }

    const parserStatus = this.parserStatus(exception);
    if (parserStatus) {
      return this.httpExceptionResponse(parserStatus, requestId, null);
    }

    this.logger.error({ exception, requestId }, 'Unexpected request failure.');

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

  private httpExceptionResponse(
    statusCode: number,
    requestId: string,
    source: string | object | null,
  ): { statusCode: number; body: ErrorEnvelope } {
    const code = statusCodeToErrorCode.get(statusCode) ?? 'INTERNAL_ERROR';
    const details =
      statusCode === HttpStatus.BAD_REQUEST && source
        ? this.validationDetails(source)
        : null;
    const message =
      safeMessages.get(statusCode) ?? 'An unexpected error occurred.';

    return {
      statusCode,
      body: this.envelope(code, message, requestId, details),
    };
  }

  private parserStatus(
    exception: unknown,
  ): HttpStatus.BAD_REQUEST | HttpStatus.PAYLOAD_TOO_LARGE | undefined {
    if (typeof exception !== 'object' || exception === null) {
      return undefined;
    }

    const status = Reflect.get(exception, 'status');
    if (
      status === HttpStatus.BAD_REQUEST ||
      status === HttpStatus.PAYLOAD_TOO_LARGE
    ) {
      return status;
    }

    const statusCode = Reflect.get(exception, 'statusCode');
    return statusCode === HttpStatus.BAD_REQUEST ||
      statusCode === HttpStatus.PAYLOAD_TOO_LARGE
      ? statusCode
      : undefined;
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
      fields: messages.slice(0, 32).map((message) => {
        if (typeof message === 'object' && message !== null) {
          return {
            field: String(Reflect.get(message, 'field') ?? 'request'),
            code: String(Reflect.get(message, 'code') ?? 'INVALID'),
          };
        }

        return { field: 'request', code: 'INVALID' };
      }),
    };
  }
}
