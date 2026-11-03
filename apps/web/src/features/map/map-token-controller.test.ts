import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMapTokenController } from './map-token-controller';
import { isMapApiRequest } from './useResultMap';

const token = (expirationSeconds?: number): string => {
  const payload = expirationSeconds === undefined ? {} : { exp: expirationSeconds };
  return `header.${window.btoa(JSON.stringify(payload)).replace(/=/g, '')}.signature`;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('map token controller', () => {
  it('refreshes before expiry and exposes the rotated token to later requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const first = token(Math.floor(Date.now() / 1_000) + 60);
    const second = token(Math.floor(Date.now() / 1_000) + 120);
    const getToken = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const controller = createMapTokenController(getToken);

    await controller.start();
    expect(controller.current()).toBe(first);
    expect(getToken).toHaveBeenLastCalledWith(undefined);

    await vi.advanceTimersByTimeAsync(45_000);
    expect(controller.current()).toBe(second);
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });

    controller.stop();
  });

  it('uses the fallback interval, refreshes on focus, and removes listeners on stop', async () => {
    vi.useFakeTimers();
    const getToken = vi.fn().mockResolvedValue(token());
    const addWindow = vi.spyOn(window, 'addEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const addDocument = vi.spyOn(document, 'addEventListener');
    const removeDocument = vi.spyOn(document, 'removeEventListener');
    const controller = createMapTokenController(getToken);

    await controller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getToken).toHaveBeenCalledTimes(2);

    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(getToken).toHaveBeenCalledTimes(3));

    controller.stop();
    expect(addWindow).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(addDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('retains the last token during a failure and retries with a forced refresh', async () => {
    vi.useFakeTimers();
    const first = token();
    const second = token();
    const getToken = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('temporary Clerk failure'))
      .mockResolvedValueOnce(second);
    const controller = createMapTokenController(getToken);

    await controller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(controller.current()).toBe(first);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(controller.current()).toBe(second);
    expect(getToken).toHaveBeenLastCalledWith({ skipCache: true });

    controller.stop();
  });
});

describe('map API request boundary', () => {
  it('accepts only the configured API origin and path', () => {
    const apiUrl = 'https://api.example.test/internal';
    expect(isMapApiRequest(`${apiUrl}/v1/map/tile`, apiUrl)).toBe(true);
    expect(isMapApiRequest('https://maps.example/style.json', apiUrl)).toBe(false);
    expect(
      isMapApiRequest('https://api.example.test.evil.example/internal/v1/map/tile', apiUrl)
    ).toBe(false);
  });
});
