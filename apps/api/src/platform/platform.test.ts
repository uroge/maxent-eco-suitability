import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from './errors/api-exception.filter';
import { ZodValidationPipe } from './validation/zod-validation.pipe';
import { RequestIdMiddleware } from './context/request-id.middleware';
import { normalizedClientIp } from './rate-limit/client-ip';

describe('platform contracts', () => {
  it('returns a safe dependency error envelope', () => {
    const response = {
      getHeader: () => 'request-123',
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const filter = new ApiExceptionFilter(
      { get: () => ({ requestId: 'request-123' }) } as never,
      { error: vi.fn() } as never,
    );

    filter.catch(new ServiceUnavailableException('redis://secret-host'), {
      switchToHttp: () => ({ getResponse: () => response }),
    } as never);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect(response.json).toHaveBeenCalledWith({
      error: {
        version: '1',
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Required dependencies are unavailable.',
        requestId: 'request-123',
        details: null,
      },
    });
  });

  it('returns only safe Zod field details', () => {
    const pipe = new ZodValidationPipe(z.object({ name: z.string().min(3) }));

    expect(() => pipe.transform({ name: 'x' })).toThrow(
      'Bad Request Exception',
    );
  });

  it('preserves valid request IDs and replaces unsafe values', () => {
    const middleware = new RequestIdMiddleware({
      run: (_context: unknown, callback: () => void) => callback(),
      setRoute: vi.fn(),
    } as never);
    const validResponse = { setHeader: vi.fn(), once: vi.fn() };
    const validRequest = { header: () => 'safe.request-1', method: 'GET' };

    middleware.use(validRequest as never, validResponse as never, vi.fn());
    expect(validResponse.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'safe.request-1',
    );

    const invalidResponse = { setHeader: vi.fn(), once: vi.fn() };
    middleware.use(
      { header: () => 'x'.repeat(65), method: 'GET' } as never,
      invalidResponse as never,
      vi.fn(),
    );
    expect(invalidResponse.setHeader.mock.calls[0][1]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('normalizes IPv4-mapped IPv6 addresses', () => {
    expect(normalizedClientIp({ ip: '::ffff:127.0.0.1' } as never)).toBe(
      '127.0.0.1',
    );
  });
});
