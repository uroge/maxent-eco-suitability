import { errorEnvelopeSchema, type ErrorCode, type ErrorDetails } from '@ecosuitability/contracts';

export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'INVALID_RESPONSE',
    message: string,
    public readonly details: ErrorDetails = null
  ) {
    super(message);
  }
}

export const responseError = async (response: Response): Promise<ApiClientError> => {
  const parsed = errorEnvelopeSchema.safeParse(
    await response
      .clone()
      .json()
      .catch(() => null)
  );
  if (parsed.success) {
    return new ApiClientError(
      response.status,
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.details
    );
  }
  return new ApiClientError(
    response.status,
    'INVALID_RESPONSE',
    response.status === 404
      ? 'The requested resource was not found.'
      : 'The service could not complete the request.'
  );
};
