import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';
import {
  analysisJobName,
  analysisQueueName,
  analysisQueuePrefix,
  type AnalysisJobPayload,
} from '@ecosuitability/contracts';
import { createClient, type RedisClientType } from 'redis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { AnalysisProcessor } from './analysis.processor';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';
import { LifecycleService } from '../platform/lifecycle.service';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';

const analysisKeyPrefix = 'ecosuitability:analysis:';

const createAnalysis = (analysisId: string) => ({
  id: analysisId,
  ownerId: 'user_123',
  idempotencyKey: 'request-key',
  status: 'queued',
  displayName: 'Wildcat',
  createdAt: '2026-09-02T12:00:00.000Z',
  updatedAt: '2026-09-02T12:00:00.000Z',
  expiresAt: '2026-09-04T12:00:00.000Z',
  expiredAt: null,
  failure: null,
  occurrenceDatasetId: null,
  progress: { stage: 'queued', percent: 0, attempt: null },
  execution: {
    jobId: analysisId,
    attempt: null,
    outboxDispatchedAt: '2026-09-02T12:00:00.000Z',
  },
});

const waitFor = async <T>(
  read: () => Promise<T | undefined>,
  predicate: (value: T) => boolean,
): Promise<T> => {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const value = await read();
    if (value && predicate(value)) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Timed out waiting for the worker lifecycle state.');
};

describe.runIf(integrationEnabled)(
  'AnalysisProcessor Redis integration',
  () => {
    let container: StartedTestContainer;

    let client: RedisClientType;

    let queue: Queue;

    let worker: Worker;

    beforeAll(async () => {
      container = await new GenericContainer('redis:8-alpine')
        .withExposedPorts(6379)
        .start();
      const connection = {
        host: container.getHost(),
        port: container.getMappedPort(6379),
        maxRetriesPerRequest: null,
      };
      client = createClient({
        url: `redis://${connection.host}:${connection.port}`,
      });
      await client.connect();
      queue = new Queue(analysisQueueName, {
        connection,
        prefix: analysisQueuePrefix,
      });
      const lifecycleRepository = new WorkerLifecycleRepository({
        getClient: () => client,
      } as never);
      const lifecycle = new LifecycleService({
        getOrThrow: vi.fn().mockReturnValue(10_000),
      } as never);
      const processor = new AnalysisProcessor(
        queue,
        lifecycleRepository,
        { getOrThrow: vi.fn().mockReturnValue(10_000) } as never,
        { warn: vi.fn() } as never,
        lifecycle,
      );
      await queue.setGlobalConcurrency(1);
      worker = new Worker(
        analysisQueueName,
        async (job) => processor.process(job as never),
        { connection, prefix: analysisQueuePrefix, concurrency: 1 },
      );
    }, 60_000);

    afterAll(async () => {
      await Promise.allSettled([worker?.close(), queue?.close()]);

      if (client?.isOpen) {
        await client.close();
      }

      await container?.stop();
    });

    it('executes a queued analysis once and persists completed progress', async () => {
      const analysisId = 'an_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      await client.set(
        `${analysisKeyPrefix}${analysisId}`,
        JSON.stringify(createAnalysis(analysisId)),
      );
      await queue.add(
        analysisJobName,
        { analysisId, ownerId: 'user_123' } satisfies AnalysisJobPayload,
        { jobId: analysisId, attempts: 3 },
      );

      const analysis = await waitFor(
        async () => {
          const payload = await client.get(`${analysisKeyPrefix}${analysisId}`);
          return payload
            ? (JSON.parse(payload) as ReturnType<typeof createAnalysis>)
            : undefined;
        },
        (value) => value.status === 'succeeded',
      );

      expect(analysis).toMatchObject({
        status: 'succeeded',
        progress: { stage: 'completed', percent: 100, attempt: 1 },
      });
    }, 20_000);

    it('makes cancellation win over an in-flight completion', async () => {
      const analysisId = 'an_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      await client.set(
        `${analysisKeyPrefix}${analysisId}`,
        JSON.stringify(createAnalysis(analysisId)),
      );
      await queue.add(
        analysisJobName,
        { analysisId, ownerId: 'user_123' } satisfies AnalysisJobPayload,
        { jobId: analysisId, attempts: 3 },
      );
      await waitFor(
        async () => {
          const payload = await client.get(`${analysisKeyPrefix}${analysisId}`);
          return payload
            ? (JSON.parse(payload) as ReturnType<typeof createAnalysis>)
            : undefined;
        },
        (value) => value.status === 'running',
      );

      const runningPayload = await client.get(
        `${analysisKeyPrefix}${analysisId}`,
      );
      if (!runningPayload) {
        throw new Error('Expected the running analysis to remain available.');
      }

      const cancelling = JSON.parse(runningPayload) as ReturnType<
        typeof createAnalysis
      >;
      cancelling.status = 'cancelling';
      await client.set(
        `${analysisKeyPrefix}${analysisId}`,
        JSON.stringify(cancelling),
      );

      const analysis = await waitFor(
        async () => {
          const payload = await client.get(`${analysisKeyPrefix}${analysisId}`);
          return payload
            ? (JSON.parse(payload) as ReturnType<typeof createAnalysis>)
            : undefined;
        },
        (value) => value.status === 'cancelled',
      );

      expect(analysis.status).toBe('cancelled');
      expect(analysis.progress).toMatchObject({ stage: 'cancelled' });
    }, 20_000);
  },
);
