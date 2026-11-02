import { beforeEach, describe, expect, it, vi } from 'vitest';
import { idempotencyKey } from './api';

describe('idempotencyKey', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  });

  it('keeps a key stable for one intent and rotates it for changed payloads', () => {
    const first = idempotencyKey('queue', 'an_test', { revision: 1 });
    expect(idempotencyKey('queue', 'an_test', { revision: 1 })).toBe(first);
    expect(idempotencyKey('queue', 'an_test', { revision: 2 })).not.toBe(first);
  });
});
