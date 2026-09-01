import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { StorageService } from './storage.service';

const enabled = process.env.RUN_R2_SMOKE === 'true';

describe.runIf(enabled)('R2 storage smoke test', () => {
  const service = new StorageService({
    getOrThrow: (key: string) => process.env[key],
  } as never);
  const prefix = `smoke/${randomUUID()}`;
  const objects = [`${prefix}/single`, `${prefix}/multipart`];

  afterAll(async () => {
    await Promise.all(objects.map(async (key) => service.delete(key)));
  });

  it('writes, verifies, completes multipart uploads, and cleans up', async () => {
    expect(await service.isReady()).toBe(true);
    const singleUrl = await service.presignPut(objects[0], 'text/plain');
    const singleResponse = await fetch(singleUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'ecosuitability-r2-smoke',
    });
    expect(singleResponse.ok).toBe(true);
    expect(await service.head(objects[0])).toEqual({ size: 23 });

    const uploadId = await service.createMultipart(objects[1], 'text/plain');
    const partUrl = await service.presignPart(objects[1], uploadId, 1);
    const partResponse = await fetch(partUrl, {
      method: 'PUT',
      body: 'ecosuitability-r2-multipart-smoke',
    });
    expect(partResponse.ok).toBe(true);
    const etag = partResponse.headers.get('etag');
    expect(etag).toBeTruthy();
    await service.completeMultipart(objects[1], uploadId, [
      { PartNumber: 1, ETag: etag! },
    ]);
    expect(await service.head(objects[1])).toEqual({ size: 33 });
  });
});
