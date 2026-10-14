import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RValidationClient } from './r-validation.client';

const secret = 'r-runtime-shared-secret-with-at-least-32-bytes';

const createClient = () =>
  new RValidationClient(
    {
      getOrThrow: vi.fn((key: string) => {
        const values: Record<string, string | number> = {
          R_RUNTIME_URL: 'http://analysis-r:8080',
          R_RUNTIME_SHARED_SECRET: secret,
          R_RUNTIME_HTTP_TIMEOUT_MS: 10_000,
          R_RUNTIME_RUN_TIMEOUT_MS: 600_000,
          R_RUNTIME_INPUT_URL_TTL_SECONDS: 900,
        };
        return values[key];
      }),
    } as never,
    {} as never,
    {} as never,
  );

describe('RValidationClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the domain-separated HMAC protocol for readiness requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: URL, init: RequestInit) => {
        const headers = new Headers(init.headers);
        const timestamp = headers.get('X-Run-Timestamp')!;
        const nonce = headers.get('X-Run-Nonce')!;
        const hash = headers.get('X-Run-Body-SHA256')!;
        const signingKey = createHmac('sha256', secret)
          .update('ecosuitability-r-runtime-v1')
          .digest();
        const expected = createHmac('sha256', signingKey)
          .update(`v1\nGET\n/health/ready\n${timestamp}\n${nonce}\n${hash}`)
          .digest('hex');
        expect(hash).toBe(createHash('sha256').update('').digest('hex'));
        expect(headers.get('X-Run-Signature')).toBe(expected);
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }),
    );

    await expect(createClient().isReady()).resolves.toBe(true);
  });

  it('fails readiness closed when the runtime is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    await expect(createClient().isReady()).resolves.toBe(false);
  });
});
