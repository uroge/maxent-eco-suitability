import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import {
  analysisQueueName,
  analysisQueuePrefix,
} from '@ecosuitability/contracts';

const integrationEnabled = process.env.RUN_REDIS_INTEGRATION === 'true';

describe.runIf(integrationEnabled)('BullMQ global concurrency', () => {
  let container: StartedTestContainer;
  let queue: Queue;
  let firstWorker: Worker;
  let secondWorker: Worker;

  beforeAll(async () => {
    container = await new GenericContainer('redis:8-alpine')
      .withExposedPorts(6379)
      .start();
    const connection = {
      host: container.getHost(),
      port: container.getMappedPort(6379),
      maxRetriesPerRequest: null,
    };
    queue = new Queue(analysisQueueName, {
      connection,
      prefix: analysisQueuePrefix,
    });
  }, 60_000);

  afterAll(async () => {
    await Promise.allSettled([
      firstWorker?.close(),
      secondWorker?.close(),
      queue?.close(),
    ]);
    await container?.stop();
  });

  it('limits two worker instances to one active job globally', async () => {
    let active = 0;
    let maximumActive = 0;
    let completed = 0;
    const connection = {
      host: container.getHost(),
      port: container.getMappedPort(6379),
      maxRetriesPerRequest: null,
    };
    const processor = async (): Promise<void> => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
      completed += 1;
    };

    await queue.setGlobalConcurrency(1);
    firstWorker = new Worker(analysisQueueName, processor, {
      connection,
      prefix: analysisQueuePrefix,
      concurrency: 1,
    });
    secondWorker = new Worker(analysisQueueName, processor, {
      connection,
      prefix: analysisQueuePrefix,
      concurrency: 1,
    });
    await queue.add('first', { index: 1 });
    await queue.add('second', { index: 2 });

    const deadline = Date.now() + 10_000;
    while (completed !== 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(completed).toBe(2);
    expect(maximumActive).toBe(1);
  }, 15_000);
});
