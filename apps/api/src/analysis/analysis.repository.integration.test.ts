import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createClient, type RedisClientType } from 'redis';
import { AnalysisRepository } from './analysis.repository';
import type { StoredAnalysis } from './analysis.types';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';

const createAnalysis = (
  id: string,
  idempotencyKey = 'request-key-123',
): StoredAnalysis => ({
  id,
  ownerId: 'user_123',
  idempotencyKey,
  status: 'draft',
  displayName: 'Wildcat',
  createdAt: '2026-08-31T12:00:00.000Z',
  updatedAt: '2026-08-31T12:00:00.000Z',
  expiresAt: '2026-09-02T12:00:00.000Z',
  expiredAt: null,
  failure: null,
  progress: null,
  execution: null,
});

describe.runIf(integrationEnabled)(
  'AnalysisRepository Redis integration',
  () => {
    let container: StartedTestContainer;
    let client: RedisClientType;
    let repository: AnalysisRepository;

    beforeAll(async () => {
      container = await new GenericContainer('redis:8-alpine')
        .withExposedPorts(6379)
        .start();
      client = createClient({
        url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
      });
      await client.connect();
      repository = new AnalysisRepository({ getClient: () => client } as never);
    }, 60000);

    afterAll(async () => {
      if (client?.isOpen) {
        await client.close();
      }

      await container?.stop();
    });

    it('creates once, replays an identical request, and rejects a conflicting key', async () => {
      const first = createAnalysis('an_0123456789abcdef0123456789abcdef');
      const initial = await repository.create(
        { analysis: first, fingerprint: 'fingerprint-1' },
        3600,
      );
      const replay = await repository.create(
        {
          analysis: createAnalysis('an_fedcba9876543210fedcba9876543210'),
          fingerprint: 'fingerprint-1',
        },
        3600,
      );
      const conflict = await repository.create(
        {
          analysis: createAnalysis('an_11111111111111111111111111111111'),
          fingerprint: 'fingerprint-2',
        },
        3600,
      );

      expect(initial).toMatchObject({
        replayed: false,
        analysis: { id: first.id },
      });
      expect(replay).toMatchObject({
        replayed: true,
        analysis: { id: first.id },
      });
      expect(conflict).toBe('conflict');
    });

    it('creates an expired tombstone and removes its idempotency key', async () => {
      const analysis = {
        ...createAnalysis(
          'an_22222222222222222222222222222222',
          'request-key-456',
        ),
        expiresAt: '2026-08-31T11:59:00.000Z',
      };
      await repository.create({ analysis, fingerprint: 'fingerprint-3' }, 3600);

      await repository.expireDue(new Date('2026-08-31T12:00:00.000Z'));

      await expect(
        repository.findOwned(analysis.id, analysis.ownerId),
      ).resolves.toMatchObject({
        status: 'expired',
        expiredAt: '2026-08-31T12:00:00.000Z',
      });
      await expect(
        repository.create(
          {
            analysis: createAnalysis(
              'an_33333333333333333333333333333333',
              'request-key-456',
            ),
            fingerprint: 'fingerprint-4',
          },
          3600,
        ),
      ).resolves.toMatchObject({ replayed: false });
    });
  },
);
