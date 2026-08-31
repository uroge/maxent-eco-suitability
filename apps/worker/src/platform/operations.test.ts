import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OperationsExceptionFilter } from './operations-exception.filter';

describe('worker operational errors', () => {
  it('uses the shared dependency error envelope', () => {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const filter = new OperationsExceptionFilter({ error: vi.fn() } as never);

    filter.catch(new ServiceUnavailableException('redis://secret-host'), {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'worker-request-1' }),
        getResponse: () => response,
      }),
    } as never);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith({
      error: {
        version: '1',
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Required dependencies are unavailable.',
        requestId: 'worker-request-1',
        details: null,
      },
    });
  });
});
