import type { ErrorCode, ErrorDetails } from '@ecosuitability/contracts';

export class ApiException extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: ErrorDetails = null,
  ) {
    super(message);
  }
}
