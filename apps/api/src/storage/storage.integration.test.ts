import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { StorageService } from './storage.service';

const integrationEnabled = process.env.RUN_STORAGE_INTEGRATION === 'true';

describe.runIf(integrationEnabled)('SeaweedFS storage integration', () => {
  let container: StartedTestContainer;
  let storage: StorageService;

  beforeAll(async () => {
    container = await new GenericContainer(
      'chrislusf/seaweedfs:4.44@sha256:e67e8c385484120b78bff47ba5f4debbca47fbd27ed1a39f016f47e8baea615b',
    )
      .withEntrypoint(['/bin/sh', '-ec'])
      .withCommand([
        'printf %s \'{"identities":[{"name":"test","credentials":[{"accessKey":"test-storage-access-key","secretKey":"test-storage-secret-key"}],"actions":["Admin","Read","List","Tagging","Write"]}]}\' >/tmp/s3.json && exec weed server -dir=/data -filer -s3 -s3.port=8333 -s3.config=/tmp/s3.json',
      ])
      .withExposedPorts(8333)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    const endpoint = `http://${container.getHost()}:${container.getMappedPort(8333)}`;
    storage = new StorageService({
      getOrThrow: (key: string) =>
        ({
          STORAGE_REGION: 'us-east-1',
          STORAGE_FORCE_PATH_STYLE: true,
          STORAGE_ACCESS_KEY_ID: 'test-storage-access-key',
          STORAGE_SECRET_ACCESS_KEY: 'test-storage-secret-key',
          STORAGE_INTERNAL_ENDPOINT: endpoint,
          STORAGE_PRESIGN_ENDPOINT: endpoint,
          STORAGE_BUCKET: 'ecosuitability',
          STORAGE_PROVIDER: 'seaweedfs',
          STORAGE_CORS_ORIGINS: ['http://localhost:3000'],
        })[key],
    } as never);
    await storage.bootstrap();
  }, 60000);

  afterAll(async () => {
    await container?.stop();
  });

  it('supports single and multipart upload operations', async () => {
    const singleUrl = await storage.presignPut('single.txt', 'text/plain');
    const singleResponse = await fetch(singleUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'single',
    });
    expect(
      singleResponse.ok,
      `SeaweedFS returned ${singleResponse.status}: ${await singleResponse.text()}`,
    ).toBe(true);
    expect(await storage.head('single.txt')).toEqual({ size: 6 });

    const uploadId = await storage.createMultipart(
      'multipart.txt',
      'text/plain',
    );
    const partUrl = await storage.presignPart('multipart.txt', uploadId, 1);
    const response = await fetch(partUrl, { method: 'PUT', body: 'multipart' });
    expect(response.ok).toBe(true);
    const etag = response.headers.get('etag');
    expect(etag).toBeTruthy();
    await storage.completeMultipart('multipart.txt', uploadId, [
      { PartNumber: 1, ETag: etag! },
    ]);
    expect(await storage.head('multipart.txt')).toEqual({ size: 9 });
  });

  it('aborts multipart uploads and deletes objects', async () => {
    const uploadId = await storage.createMultipart('aborted.txt', 'text/plain');
    await storage.cleanupUpload('aborted.txt', uploadId);
    expect(await storage.head('aborted.txt')).toBeUndefined();
  });
});
