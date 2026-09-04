import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import {
  analysisQueueName,
  analysisQueuePrefix,
} from '@ecosuitability/contracts';
import { createClient, type RedisClientType } from 'redis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { AnalysisQueueService } from './analysis-queue.service';
import { ConfigurationService } from './configuration.service';
import { AnalysisRepository } from './analysis.repository';
import type { StoredAnalysis } from './analysis.types';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';

const analysisInputsKey = (analysisId: string): string =>
  `ecosuitability:analysis-inputs:${analysisId}`;

const inputManifest = (
  predictorId = 'ds_0123456789abcdef0123456789abcdef',
) => ({
  datasets: [
    {
      dataset: {
        id: 'ds_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        analysisId: 'an_placeholder',
        kind: 'occurrence',
        format: 'csv',
        status: 'ready',
        createdAt: '2026-08-31T12:00:00.000Z',
        expiresAt: '2026-08-31T13:00:00.000Z',
      },
      files: [
        {
          uploadId: 'up_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          storageKey: 'analyses/original/occurrences.csv',
          originalName: 'occurrences.csv',
          size: 64,
          declaredSha256: 'a'.repeat(64),
          sha256Verification: 'client-declared',
          contentType: 'text/csv',
          component: null,
        },
      ],
      attachedAt: '2026-08-31T12:00:00.000Z',
    },
    {
      dataset: {
        id: predictorId,
        analysisId: 'an_placeholder',
        kind: 'predictor',
        format: 'geotiff',
        status: 'ready',
        createdAt: '2026-08-31T12:00:00.000Z',
        expiresAt: '2026-08-31T13:00:00.000Z',
      },
      files: [
        {
          uploadId: 'up_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          storageKey: 'analyses/original/predictor.tif',
          originalName: 'predictor.tif',
          size: 64,
          declaredSha256: 'b'.repeat(64),
          sha256Verification: 'client-declared',
          contentType: 'image/tiff',
          component: null,
        },
      ],
      attachedAt: '2026-08-31T12:00:00.000Z',
    },
  ],
});

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
  configuration: {
    schemaVersion: 1,
    speciesName: 'Wildcat',
    occurrence: {
      format: 'csv',
      longitudeColumn: 'longitude',
      latitudeColumn: 'latitude',
    },
    predictors: [
      {
        datasetId: 'ds_0123456789abcdef0123456789abcdef',
        variableName: 'temperature',
        type: 'continuous',
      },
    ],
    studyArea: { strategy: 'predictor-intersection' },
    background: { strategy: 'random', pointCount: 10000 },
    model: {
      featureClasses: ['linear', 'quadratic', 'product', 'hinge'],
      regularizationMultiplier: 1,
    },
    validation: { method: 'train-test-split', testFraction: 0.2 },
    seed: 42,
  },
  configurationRevision: 1,
  configurationFingerprint: 'jcs-sha256-v1:test',
});

describe.runIf(integrationEnabled)(
  'AnalysisRepository Redis integration',
  () => {
    let container: StartedTestContainer;

    let client: RedisClientType;

    let repository: AnalysisRepository;

    let queue: Queue;

    beforeAll(async () => {
      container = await new GenericContainer('redis:8-alpine')
        .withExposedPorts(6379)
        .start();
      client = createClient({
        url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
      });
      await client.connect();
      repository = new AnalysisRepository({ getClient: () => client } as never);
      queue = new Queue(analysisQueueName, {
        connection: {
          host: container.getHost(),
          port: container.getMappedPort(6379),
          maxRetriesPerRequest: null,
        },
        prefix: analysisQueuePrefix,
      });
    }, 60000);

    afterAll(async () => {
      if (client?.isOpen) {
        await client.close();
      }

      await queue?.close();

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

    it('atomically queues a ready analysis and dispatches its deterministic outbox job', async () => {
      const analysis = {
        ...createAnalysis(
          'an_44444444444444444444444444444444',
          'request-key-444',
        ),
        status: 'ready' as const,
      };
      await repository.create({ analysis, fingerprint: 'fingerprint-5' }, 3600);
      await client.set(
        analysisInputsKey(analysis.id),
        JSON.stringify(inputManifest()),
      );

      await expect(
        repository.queue(
          analysis.id,
          analysis.ownerId,
          new Date('2026-09-03T12:00:00.000Z'),
        ),
      ).resolves.toMatchObject({
        status: 'queued',
        execution: { jobId: analysis.id },
      });

      const service = new AnalysisQueueService(queue, repository, {
        error: () => undefined,
      } as never);
      await service.reconcile();

      await expect(queue.getJob(analysis.id)).resolves.toMatchObject({
        id: analysis.id,
        name: 'run-analysis',
        data: { analysisId: analysis.id, ownerId: analysis.ownerId },
      });
      await expect(
        repository.findOwned(analysis.id, analysis.ownerId),
      ).resolves.toMatchObject({
        status: 'queued',
        execution: { outboxDispatchedAt: expect.any(String) },
        executionSnapshot: {
          configuration: analysis.configuration,
          inputManifest: inputManifest(),
          inputFingerprint: expect.stringMatching(/^jcs-sha256-v1:/),
        },
      });
    });

    it('persists idempotent configuration revisions only for attached inputs', async () => {
      const analysis = {
        ...createAnalysis(
          'an_99999999999999999999999999999999',
          'request-key-999',
        ),
        status: 'ready' as const,
        configuration: undefined,
        configurationRevision: undefined,
        configurationFingerprint: undefined,
      };
      await repository.create({ analysis, fingerprint: 'fingerprint-9' }, 3600);
      await client.set(
        analysisInputsKey(analysis.id),
        JSON.stringify(inputManifest()),
      );
      const service = new ConfigurationService(repository);
      const principal = {
        userId: analysis.ownerId,
        sessionId: 'session_123',
        role: 'user' as const,
      };
      const request = {
        expectedRevision: 0,
        configuration: createAnalysis('an_unused').configuration!,
      };

      const initial = await service.update(
        principal,
        analysis.id,
        'configuration-key-999',
        request,
      );
      const replay = await service.update(
        principal,
        analysis.id,
        'configuration-key-999',
        request,
      );

      expect(initial).toMatchObject({ revision: 1, mode: 'editable' });
      expect(replay).toEqual(initial);
      await expect(
        service.update(principal, analysis.id, 'configuration-key-999', {
          ...request,
          configuration: {
            ...request.configuration,
            speciesName: 'Different species',
          },
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
      await expect(
        service.update(principal, analysis.id, 'configuration-key-998', {
          expectedRevision: 1,
          configuration: {
            ...request.configuration,
            predictors: [
              {
                ...request.configuration.predictors[0],
                datasetId: 'ds_cccccccccccccccccccccccccccccccc',
              },
            ],
          },
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    });

    it('freezes the original input manifest even if its Redis key is later corrupted', async () => {
      const analysis = {
        ...createAnalysis(
          'an_88888888888888888888888888888888',
          'request-key-888',
        ),
        status: 'ready' as const,
      };
      await repository.create(
        { analysis, fingerprint: 'fingerprint-10' },
        3600,
      );
      const originalManifest = inputManifest();
      await client.set(
        analysisInputsKey(analysis.id),
        JSON.stringify(originalManifest),
      );
      await repository.queue(
        analysis.id,
        analysis.ownerId,
        new Date('2026-09-03T12:00:00.000Z'),
      );
      await client.set(
        analysisInputsKey(analysis.id),
        JSON.stringify(inputManifest('ds_dddddddddddddddddddddddddddddddd')),
      );

      await expect(
        repository.findOwned(analysis.id, analysis.ownerId),
      ).resolves.toMatchObject({
        status: 'queued',
        executionSnapshot: { inputManifest: originalManifest },
      });
    });

    it('reclaims an undispatched outbox after its lease expires', async () => {
      const analysis = {
        ...createAnalysis(
          'an_77777777777777777777777777777777',
          'request-key-777',
        ),
        status: 'ready' as const,
      };
      const now = new Date('2026-08-31T12:00:00.000Z');
      await repository.create({ analysis, fingerprint: 'fingerprint-8' }, 3600);
      await repository.queue(
        analysis.id,
        analysis.ownerId,
        new Date('2026-09-03T12:00:00.000Z'),
      );

      const firstClaim = await repository.claimOutbox(analysis.id, now);
      const recoveredClaim = await repository.claimOutbox(
        analysis.id,
        new Date(now.getTime() + 30_001),
      );

      expect(firstClaim).toMatchObject({ status: 'pending' });
      expect(recoveredClaim).toMatchObject({
        analysisId: analysis.id,
        status: 'pending',
      });
      expect(recoveredClaim?.leaseId).not.toBe(firstClaim?.leaseId);
    });

    it('cancels queued and running analyses without allowing a later success transition', async () => {
      const queued = {
        ...createAnalysis(
          'an_55555555555555555555555555555555',
          'request-key-555',
        ),
        status: 'ready' as const,
      };
      await repository.create(
        { analysis: queued, fingerprint: 'fingerprint-6' },
        3600,
      );
      await repository.queue(
        queued.id,
        queued.ownerId,
        new Date('2026-09-03T12:00:00.000Z'),
      );
      await expect(
        repository.cancel(queued.id, queued.ownerId),
      ).resolves.toMatchObject({ status: 'cancelled' });

      const running = {
        ...createAnalysis(
          'an_66666666666666666666666666666666',
          'request-key-666',
        ),
        status: 'running' as const,
        execution: {
          jobId: 'an_66666666666666666666666666666666',
          attempt: 1,
          outboxDispatchedAt: new Date().toISOString(),
        },
      };
      await repository.create(
        { analysis: running, fingerprint: 'fingerprint-7' },
        3600,
      );
      await expect(
        repository.cancel(running.id, running.ownerId),
      ).resolves.toMatchObject({ status: 'cancelling' });
      await expect(
        repository.transition({
          analysisId: running.id,
          ownerId: running.ownerId,
          expectedStatuses: ['running'],
          status: 'succeeded',
          failure: null,
        }),
      ).resolves.toBe('invalid');
    });
  },
);
