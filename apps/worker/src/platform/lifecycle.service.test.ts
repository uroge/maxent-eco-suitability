import { describe, expect, it, vi } from 'vitest';
import { LifecycleService } from './lifecycle.service';

describe('LifecycleService', () => {
  it('rejects new requests and jobs while draining', async () => {
    const lifecycle = new LifecycleService({
      getOrThrow: vi.fn().mockReturnValue(1_000),
    } as never);

    lifecycle.beginDraining();

    expect(lifecycle.beginRequest()).toBe(false);
    expect(lifecycle.beginJob()).toBe(false);
    await expect(lifecycle.waitForDrain()).resolves.toBeUndefined();
  });

  it('waits for active jobs before completing a drain', async () => {
    const lifecycle = new LifecycleService({
      getOrThrow: vi.fn().mockReturnValue(1_000),
    } as never);
    lifecycle.beginJob();
    lifecycle.beginDraining();
    setTimeout(() => lifecycle.endJob(), 25);

    await expect(lifecycle.waitForDrain()).resolves.toBeUndefined();
  });
});
