import { describe, expect, it, vi } from 'vitest';
import { OperationIdempotencyService } from './operation-idempotency.service';

const principal = {
  userId: 'user_1',
  sessionId: 'session_1',
  role: 'user' as const,
};
const analysisId = 'an_0123456789abcdef0123456789abcdef';
const key = 'operation-key-123';

describe('OperationIdempotencyService', () => {
  it('persists a successful response and replays it without invoking the handler', async () => {
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(['claimed'])
      .mockResolvedValueOnce(['completed'])
      .mockResolvedValueOnce(['replay', JSON.stringify({ ok: true })]);
    const service = new OperationIdempotencyService({
      getClient: () => ({ eval: evalScript }),
    } as never);
    const handler = vi.fn().mockResolvedValue({ ok: true });
    await expect(
      service.execute(
        principal,
        analysisId,
        key,
        'queue',
        { revision: 1 },
        handler,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.execute(
        principal,
        analysisId,
        key,
        'queue',
        { revision: 1 },
        handler,
      ),
    ).resolves.toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns conflict for key reuse with a different fingerprint', async () => {
    const service = new OperationIdempotencyService({
      getClient: () => ({ eval: vi.fn().mockResolvedValue(['conflict']) }),
    } as never);
    await expect(
      service.execute(
        principal,
        analysisId,
        key,
        'queue',
        { revision: 2 },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('releases a pending claim when the operation fails', async () => {
    const evalScript = vi
      .fn()
      .mockResolvedValueOnce(['claimed'])
      .mockResolvedValueOnce(['released']);
    const service = new OperationIdempotencyService({
      getClient: () => ({ eval: evalScript }),
    } as never);

    await expect(
      service.execute(
        principal,
        analysisId,
        key,
        'queue',
        { revision: 1 },
        async () => {
          throw new Error('temporary failure');
        },
      ),
    ).rejects.toThrow('temporary failure');
    expect(evalScript).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['missing', 404],
    ['pending', 409],
  ])(
    'maps a %s claim result to a safe HTTP error',
    async (result, statusCode) => {
      const service = new OperationIdempotencyService({
        getClient: () => ({ eval: vi.fn().mockResolvedValue([result]) }),
      } as never);

      await expect(
        service.execute(principal, analysisId, key, 'queue', {}, vi.fn()),
      ).rejects.toMatchObject({ statusCode });
    },
  );
});
