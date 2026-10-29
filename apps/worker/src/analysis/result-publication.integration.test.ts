import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type RedisClientType } from 'redis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import {
  analysisArtifactSpecifications,
  scientificArtifactSpecifications,
} from '@ecosuitability/contracts';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';
import { ResultService } from './result.service';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';
const analysisKeyPrefix = 'ecosuitability:analysis:';

describe.runIf(integrationEnabled)(
  'verified result publication recovery',
  () => {
    let container: StartedTestContainer;
    let client: RedisClientType;
    let repository: WorkerLifecycleRepository;

    beforeAll(async () => {
      container = await new GenericContainer('redis:8-alpine')
        .withExposedPorts(6379)
        .start();
      client = createClient({
        url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
      });
      await client.connect();
      repository = new WorkerLifecycleRepository({
        getClient: () => client,
      } as never);
    }, 60_000);

    afterAll(async () => {
      if (client?.isOpen) await client.close();
      await container?.stop();
    });

    it('publishes uploaded artifacts after a worker crash without rerunning the model', async () => {
      const analysisId = 'an_cccccccccccccccccccccccccccccccc';
      const candidateCompletedAt = new Date().toISOString();
      const job = { id: analysisId, data: { analysisId, ownerId: 'user_123' } };
      await client.set(
        `${analysisKeyPrefix}${analysisId}`,
        JSON.stringify({
          id: analysisId,
          status: 'running',
          expiresAt: '2026-09-04T12:00:00.000Z',
          failure: null,
          execution: { jobId: analysisId, attempt: 1 },
          executionSnapshot: {
            inputRevision: 2,
            configurationRevision: 1,
            inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
            fingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
            seed: 42,
          },
        }),
      );
      const storageState = new Map<
        string,
        {
          size: number;
          contentType: string;
          contentDisposition: string;
          sha256: string;
        }
      >();
      const storage = {
        head: async (key: string) => storageState.get(key),
      };
      const first = new ResultService(repository, storage as never);
      const provisional = await first.provision(job, 1);
      if (typeof provisional === 'string') throw new Error(provisional);
      const generated = scientificArtifactSpecifications.map(
        (definition, index) => ({
          kind: definition.kind,
          size: index + 1,
          sha256: createHash('sha256').update(definition.kind).digest('hex'),
        }),
      );
      const uploading = await first.beginUpload(
        job,
        1,
        provisional,
        generated,
        candidateCompletedAt,
      );
      for (const artifact of uploading.artifacts) {
        storageState.set(artifact.storageKey, {
          size: artifact.size,
          contentType: artifact.contentType,
          contentDisposition: artifact.contentDisposition,
          sha256: artifact.sha256,
        });
      }
      const bundleDefinition = analysisArtifactSpecifications.find(
        (artifact) => artifact.kind === 'result-bundle',
      )!;
      const bundleArtifact = {
        id: `ar_${'f'.repeat(32)}`,
        ...bundleDefinition,
        storageKey: `analyses/${analysisId}/results/bundle/${bundleDefinition.filename}`,
        contentDisposition: `attachment; filename="${bundleDefinition.filename}"`,
        size: 4096,
        sha256: 'f'.repeat(64),
        sha256Verification: 'worker-verified' as const,
        createdAt: uploading.candidateCompletedAt!,
      };
      await expect(
        repository.appendBundle(analysisId, analysisId, 1, bundleArtifact),
      ).resolves.toMatchObject({ artifacts: expect.any(Array) });
      storageState.set(bundleArtifact.storageKey, {
        size: bundleArtifact.size,
        contentType: bundleArtifact.contentType,
        contentDisposition: bundleArtifact.contentDisposition,
        sha256: bundleArtifact.sha256,
      });

      await expect(repository.claim(analysisId, analysisId, 2)).resolves.toBe(
        'claimed',
      );
      const recovered = new ResultService(repository, storage as never);
      await expect(recovered.resumeAvailable(job, 2)).resolves.toBe(
        'succeeded',
      );

      const stored = JSON.parse(
        (await client.get(`${analysisKeyPrefix}${analysisId}`))!,
      ) as {
        status: string;
        resultManifest: { artifacts: Array<{ storageKey: string }> };
      };
      expect(stored.status).toBe('succeeded');
      expect(stored.resultManifest.artifacts).toHaveLength(10);
      expect(
        stored.resultManifest.artifacts.every(
          (artifact) => artifact.storageKey,
        ),
      ).toBe(true);
      expect(
        await client.pTTL(`${analysisKeyPrefix}${analysisId}`),
      ).toBeGreaterThan(47 * 60 * 60 * 1000);
    }, 30_000);

    it('replaces unverified artifact metadata when a retry regenerates outputs', async () => {
      const analysisId = 'an_dddddddddddddddddddddddddddddddd';
      const firstCompletedAt = '2026-09-02T12:00:00.000Z';
      const retryCompletedAt = '2026-09-02T12:05:00.000Z';
      const job = { id: analysisId, data: { analysisId, ownerId: 'user_123' } };
      await client.set(
        `${analysisKeyPrefix}${analysisId}`,
        JSON.stringify({
          id: analysisId,
          status: 'running',
          expiresAt: '2026-09-04T12:00:00.000Z',
          failure: null,
          execution: { jobId: analysisId, attempt: 1 },
        }),
      );
      const service = new ResultService(repository, {} as never);
      const initial = await service.provision(job, 1);
      if (typeof initial === 'string') {
        throw new Error(initial);
      }
      const firstGeneration = scientificArtifactSpecifications.map(
        (definition, index) => ({
          kind: definition.kind,
          size: index + 1,
          sha256: createHash('sha256')
            .update(`first:${definition.kind}`)
            .digest('hex'),
        }),
      );
      await service.beginUpload(
        job,
        1,
        initial,
        firstGeneration,
        firstCompletedAt,
      );

      await expect(repository.claim(analysisId, analysisId, 2)).resolves.toBe(
        'claimed',
      );
      const retryProvisional = await service.provision(job, 2);
      if (typeof retryProvisional === 'string') {
        throw new Error(retryProvisional);
      }
      const retryGeneration = scientificArtifactSpecifications.map(
        (definition, index) => ({
          kind: definition.kind,
          size: index + 101,
          sha256: createHash('sha256')
            .update(`retry:${definition.kind}`)
            .digest('hex'),
        }),
      );
      const uploading = await service.beginUpload(
        job,
        2,
        retryProvisional,
        retryGeneration,
        retryCompletedAt,
      );

      expect(uploading.attempt).toBe(2);
      expect(uploading.candidateCompletedAt).toBe(retryCompletedAt);
      expect(
        uploading.artifacts.map(({ kind, size, sha256 }) => ({
          kind,
          size,
          sha256,
        })),
      ).toEqual(retryGeneration);
    }, 30_000);
  },
);
