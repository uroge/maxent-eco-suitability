import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MapRateLimitGuard } from './map-rate-limit.guard';

const context = (response = { setHeader: vi.fn() }) => ({
  switchToHttp: () => ({
    getRequest: () => ({
      principal: { userId: 'user_1' },
      ip: '127.0.0.1',
    }),
    getResponse: () => response,
  }),
});

describe('MapRateLimitGuard', () => {
  it('consumes the dedicated user and IP map limits', async () => {
    const consume = vi.fn().mockResolvedValue(undefined);
    const guard = new MapRateLimitGuard({
      consume,
      retryAfterSeconds: vi.fn(),
    } as never);
    await expect(guard.canActivate(context() as never)).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith('map-user', 'user_1');
    expect(consume).toHaveBeenCalledWith('map-ip', '127.0.0.1');
  });

  it('returns a retry hint when the dedicated limit is exceeded', async () => {
    const response = { setHeader: vi.fn() };
    const rejection = { msBeforeNext: 2500 };
    const guard = new MapRateLimitGuard({
      consume: vi.fn().mockRejectedValue(rejection),
      retryAfterSeconds: () => 3,
    } as never);
    await expect(
      guard.canActivate(context(response) as never),
    ).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 3);
  });

  it('fails closed when the limiter dependency fails', async () => {
    const guard = new MapRateLimitGuard({
      consume: vi.fn().mockRejectedValue(new Error('redis unavailable')),
      retryAfterSeconds: vi.fn(),
    } as never);
    await expect(guard.canActivate(context() as never)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
