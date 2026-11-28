import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createClient, type RedisClientType } from 'redis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { ConfigService } from '@nestjs/config';
import {
  analysisArtifactSpecifications,
  analysisJobName,
  scientificArtifactSpecifications,
} from '@ecosuitability/contracts';
import type { WorkerEnvironment } from '../env';
import { LifecycleService } from '../platform/lifecycle.service';
import { AnalysisProcessor } from './analysis.processor';
import { RValidationClient } from './r-validation.client';
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
      if (client?.isOpen) {
        await client.close();
      }
      await container?.stop();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const stageOutputs = async (analysisId: string, loss?: 'zip' | 'map') => {
      const datasetId = 'ds_0123456789abcdef0123456789abcdef';
      const analysisKey = `${analysisKeyPrefix}${analysisId}`;
      const analysis = {
        id: analysisId,
        status: 'running',
        execution: { jobId: analysisId, attempt: 1 },
        executionSnapshot: {
          inputRevision: 2,
          configurationRevision: 1,
          inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
          fingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
          seed: 42,
          configuration: { predictors: [{ datasetId }] },
        },
        mapAssets: [
          {
            datasetId,
            storageKey: `analyses/${analysisId}/map/${datasetId}.tif`,
          },
        ],
      };
      await client.set(analysisKey, JSON.stringify(analysis));

      const job = {
        id: analysisId,
        name: analysisJobName,
        data: { analysisId, ownerId: 'user_123' },
        attemptsMade: 1,
        opts: { attempts: 3 },
        updateProgress: vi.fn(),
      };
      const objects = new Map<
        string,
        {
          body: Buffer;
          contentType: string;
          contentDisposition: string;
          sha256: string;
        }
      >();
      if (loss !== 'map') {
        objects.set(analysis.mapAssets[0].storageKey, {
          body: Buffer.from('predictor raster'),
          contentType: 'image/tiff',
          contentDisposition: `inline; filename="${datasetId}.tif"`,
          sha256: createHash('sha256').update('predictor raster').digest('hex'),
        });
      }
      const onBundleUploaded = vi
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      const storage = {
        head: async (key: string) => {
          const object = objects.get(key);
          return object && { ...object, size: object.body.byteLength };
        },
        getStream: async (key: string) => Readable.from(objects.get(key)!.body),
        putStream: async (
          key: string,
          stream: Readable,
          contentType: string,
          contentDisposition: string,
          sha256: string,
        ) => {
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          objects.set(key, {
            body: Buffer.concat(chunks),
            contentType,
            contentDisposition,
            sha256,
          });
          await onBundleUploaded();
        },
        delete: async (key: string) => {
          objects.delete(key);
        },
      };

      const outputs = new ResultService(repository, storage as never);
      const provisional = await outputs.provision(job, 1);
      if (typeof provisional === 'string') {
        throw new Error(provisional);
      }
      const completedAt = new Date().toISOString();
      const generated = scientificArtifactSpecifications.map(({ kind }) => ({
        kind,
        size: Buffer.byteLength(kind),
        sha256: createHash('sha256').update(kind).digest('hex'),
      }));
      const uploading = await outputs.beginUpload(
        job,
        1,
        provisional,
        generated,
        completedAt,
      );
      for (const {
        kind,
        storageKey,
        contentType,
        contentDisposition,
        sha256,
      } of uploading.artifacts) {
        objects.set(storageKey, {
          body: Buffer.from(kind),
          contentType,
          contentDisposition,
          sha256,
        });
      }
      if (loss === 'zip') {
        const bundled = await outputs.createBundle(job, 1, uploading);
        const zip = bundled.artifacts.find(
          ({ kind }) => kind === 'result-bundle',
        )!;
        objects.delete(zip.storageKey);
      }

      const acknowledgePath = `/v1/runs/${analysisId}.execute.1/complete`;
      const runtimeRequests: string[] = [];
      vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
        runtimeRequests.push(`${init.method} ${url.pathname}`);
        return url.pathname === acknowledgePath
          ? Response.json({})
          : new Response(null, { status: 500 });
      });
      const config = new ConfigService<WorkerEnvironment, true>({
        R_RUNTIME_URL: 'http://analysis-r:8080',
        R_RUNTIME_SHARED_SECRET: 'test-runtime-secret-32-characters',
        R_RUNTIME_HTTP_TIMEOUT_MS: 10_000,
        ANALYSIS_EXECUTION_TIMEOUT_MS: 10_000,
      });
      const processor = new AnalysisProcessor(
        {} as never,
        repository,
        config,
        { warn: vi.fn() } as never,
        new LifecycleService(config),
        new ResultService(repository, storage as never),
        new RValidationClient(config, repository, storage as never),
      );
      const readAnalysis = async () =>
        JSON.parse((await client.get(analysisKey))!) as {
          status: string;
          resultManifest?: {
            completedAt: string;
            resultExpiresAt: string;
            artifacts: Array<{ filename: string }>;
          };
        };
      const cancel = async () => {
        const current = await readAnalysis();
        await client.set(
          analysisKey,
          JSON.stringify({ ...current, status: 'cancelling' }),
          { KEEPTTL: true },
        );
      };
      return {
        acknowledgePath,
        cancel,
        job,
        onBundleUploaded,
        processor,
        readAnalysis,
        runtimeRequests,
      };
    };

    it('finalizes cancellation accepted after ZIP upload and before result publication', async () => {
      const run = await stageOutputs('an_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      run.onBundleUploaded.mockImplementationOnce(run.cancel);

      await run.processor.process(run.job as never);

      const analysis = await run.readAnalysis();
      expect(analysis.status).toBe('cancelled');
      expect(analysis.resultManifest).toBeUndefined();
    }, 30_000);

    it('rebuilds a missing ZIP after a crash and releases the R run without rerunning it', async () => {
      const run = await stageOutputs('an_ffffffffffffffffffffffffffffffff');

      await run.processor.process(run.job as never);

      const analysis = await run.readAnalysis();
      expect(analysis.status).toBe('succeeded');
      const manifest = analysis.resultManifest!;
      expect(manifest.artifacts).toHaveLength(10);
      expect(manifest.artifacts).toContainEqual(
        expect.objectContaining({ filename: 'ecosuitability-results.zip' }),
      );
      expect(
        Date.parse(manifest.resultExpiresAt) - Date.parse(manifest.completedAt),
      ).toBe(48 * 60 * 60 * 1000);
      expect(run.runtimeRequests).toEqual([`POST ${run.acknowledgePath}`]);
    }, 30_000);

    it('rebuilds a recorded ZIP that is missing from object storage', async () => {
      const run = await stageOutputs(
        'an_11111111111111111111111111111111',
        'zip',
      );

      await run.processor.process(run.job as never);

      expect(await run.readAnalysis()).toMatchObject({ status: 'succeeded' });
      expect(run.runtimeRequests).toEqual([`POST ${run.acknowledgePath}`]);
    }, 30_000);

    it('does not publish recovered results when a predictor raster is missing', async () => {
      const run = await stageOutputs(
        'an_22222222222222222222222222222222',
        'map',
      );

      await expect(run.processor.process(run.job as never)).rejects.toThrow();

      expect((await run.readAnalysis()).resultManifest).toBeUndefined();
    }, 30_000);

    it('publishes uploaded artifacts after a worker crash without rerunning the model', async () => {
      const analysisId = 'an_cccccccccccccccccccccccccccccccc';
      const candidateCompletedAt = new Date().toISOString();
      const job = { id: analysisId, data: { analysisId, ownerId: 'user_123' } };
      const datasetId = 'ds_0123456789abcdef0123456789abcdef';
      const mapKey = `analyses/${analysisId}/map/${datasetId}.tif`;
      await client.set(
        `${analysisKeyPrefix}${analysisId}`,
        JSON.stringify({
          id: analysisId,
          status: 'running',
          expiresAt: '2026-09-04T12:00:00.000Z',
          failure: null,
          execution: { jobId: analysisId, attempt: 1 },
          mapAssets: [{ datasetId, storageKey: mapKey }],
          executionSnapshot: {
            inputRevision: 2,
            configurationRevision: 1,
            inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
            fingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
            seed: 42,
            configuration: { predictors: [{ datasetId }] },
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
      storageState.set(mapKey, {
        size: 1234,
        contentType: 'image/tiff',
        contentDisposition: `inline; filename="${datasetId}.tif"`,
        sha256: 'a'.repeat(64),
      });
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
      await expect(recovered.openPublication(job, 2)).resolves.toBe(
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
