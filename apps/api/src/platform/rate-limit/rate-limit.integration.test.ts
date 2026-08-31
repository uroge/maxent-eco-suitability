import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createClient, type RedisClientType } from 'redis';
import { RateLimitService } from './rate-limit.service';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';

describe.runIf(integrationEnabled)('Redis-backed rate limiting', () => {
  let container: StartedTestContainer;
  let client: RedisClientType;

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withExposedPorts(6379)
      .start();
    client = createClient({
      url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    });
    await client.connect();
  }, 60000);

  afterAll(async () => {
    if (client?.isOpen) {
      await client.close();
    }

    await container?.stop();
  });

  it('shares anonymous limits across independent API instances', async () => {
    const redis = { getClient: () => client };
    const firstApi = new RateLimitService(redis as never);
    const secondApi = new RateLimitService(redis as never);

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await firstApi.consume('anonymous', '203.0.113.10');
    }

    await expect(
      secondApi.consume('anonymous', '203.0.113.10'),
    ).rejects.toMatchObject({ remainingPoints: 0 });
  });
});
