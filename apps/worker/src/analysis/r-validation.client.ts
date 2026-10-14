import { Injectable } from '@nestjs/common';
import {
  rValidationEventsPageSchema,
  type RValidationEvent,
  type RValidationSummary,
} from '@ecosuitability/contracts';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { WorkerEnvironment } from '../env';
import { WorkerStorageService } from '../storage/worker-storage.service';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';

type ExecutionSnapshot = {
  fingerprint: string;
  inputFingerprint: string;
  configuration: {
    predictors?: Array<{ datasetId: string }>;
  };
  inputManifest: {
    datasets: Array<{
      dataset: { id: string; kind: string; format: string };
      files: Array<{ storageKey: string }>;
    }>;
  };
};

type RunAccepted = {
  runId: string;
  state: string;
  eventSequence: number;
};

export class ScientificValidationError extends Error {
  public constructor(code: string) {
    super(code);
  }
}

export class RRuntimeError extends Error {}

export class RValidationCancelledError extends Error {}

@Injectable()
export class RValidationClient {
  public constructor(
    private readonly config: ConfigService<WorkerEnvironment, true>,
    private readonly lifecycle: WorkerLifecycleRepository,
    private readonly storage: WorkerStorageService,
  ) {}

  public async isReady(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string }>(
        'GET',
        '/health/ready',
      );
      return response.status === 'ok';
    } catch {
      return false;
    }
  }

  public async validate(
    analysisId: string,
    jobId: string,
    attempt: number,
    signal: AbortSignal,
    onEvent: (
      event: RValidationEvent,
      summary: RValidationSummary | null,
    ) => Promise<void>,
  ): Promise<RValidationSummary> {
    const snapshot = await this.snapshot(analysisId);
    const inputManifest = this.selectedManifest(snapshot);
    const runId = `${analysisId}.${attempt}`;
    const accepted = await this.request<RunAccepted>(
      'POST',
      '/v1/runs',
      {
        runId,
        analysisId,
        jobId,
        attempt,
        configurationFingerprint: snapshot.fingerprint,
        inputFingerprint: snapshot.inputFingerprint,
        configuration: snapshot.configuration,
        inputManifest,
      },
      signal,
    );
    if (accepted.runId !== runId) {
      throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
    }

    await this.refreshCapabilities(runId, inputManifest, signal);
    const deadline =
      Date.now() + this.config.getOrThrow('R_RUNTIME_RUN_TIMEOUT_MS');
    let afterSequence = accepted.eventSequence;

    try {
      while (Date.now() < deadline) {
        const page = rValidationEventsPageSchema.parse(
          await this.request<unknown>(
            'GET',
            `/v1/runs/${encodeURIComponent(runId)}/events?afterSequence=${afterSequence}&limit=100`,
            undefined,
            signal,
          ),
        );
        for (const event of page.events) {
          await onEvent(event, page.summary);
        }
        afterSequence = page.nextSequence;

        if (page.state === 'succeeded') {
          if (!page.summary) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          return page.summary;
        }
        if (page.state === 'failed') {
          if (!page.failureCode) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          if (page.failureCode.startsWith('R_RUNTIME_')) {
            throw new RRuntimeError(page.failureCode);
          }
          throw new ScientificValidationError(page.failureCode);
        }
        if (page.state === 'cancelled' || signal.aborted) {
          throw new RValidationCancelledError('R validation was cancelled.');
        }
        await this.sleep(signal);
      }
      throw new RRuntimeError('R_RUNTIME_TIMEOUT');
    } catch (error) {
      if (signal.aborted) {
        await this.cancel(runId).catch(() => undefined);
        throw new RValidationCancelledError('R validation was cancelled.');
      }
      throw error;
    }
  }

  public async cancel(runId: string): Promise<void> {
    await this.request('DELETE', `/v1/runs/${encodeURIComponent(runId)}`);
  }

  private async snapshot(analysisId: string): Promise<ExecutionSnapshot> {
    const snapshot = await this.lifecycle.executionSnapshot(analysisId);
    if (!snapshot || typeof snapshot !== 'object') {
      throw new RRuntimeError('R_RUNTIME_UNAVAILABLE');
    }
    const value = snapshot as Partial<ExecutionSnapshot>;
    if (
      typeof value.fingerprint !== 'string' ||
      typeof value.inputFingerprint !== 'string' ||
      !value.inputManifest ||
      !Array.isArray(value.inputManifest.datasets)
    ) {
      throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
    }
    return value as ExecutionSnapshot;
  }

  private async refreshCapabilities(
    runId: string,
    inputManifest: ExecutionSnapshot['inputManifest'],
    signal: AbortSignal,
  ): Promise<void> {
    const expiresIn = this.config.getOrThrow('R_RUNTIME_INPUT_URL_TTL_SECONDS');
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const capabilities = await Promise.all(
      inputManifest.datasets.flatMap((dataset) =>
        dataset.files.map(async (file) => ({
          storageKey: file.storageKey,
          url: await this.storage.presignGet(file.storageKey, expiresIn),
          expiresAt,
        })),
      ),
    );
    await this.request(
      'PUT',
      `/v1/runs/${encodeURIComponent(runId)}/input-capabilities`,
      { capabilities },
      signal,
    );
  }

  private selectedManifest(
    snapshot: ExecutionSnapshot,
  ): ExecutionSnapshot['inputManifest'] {
    const selectedPredictors = new Set(
      snapshot.configuration.predictors?.map(
        (predictor) => predictor.datasetId,
      ),
    );
    const datasets = snapshot.inputManifest.datasets.filter(
      (dataset) =>
        dataset.dataset.kind === 'occurrence' ||
        selectedPredictors.has(dataset.dataset.id),
    );
    if (
      datasets.filter((dataset) => dataset.dataset.kind === 'occurrence')
        .length !== 1 ||
      datasets.length !== selectedPredictors.size + 1
    ) {
      throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
    }
    return { datasets };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const raw = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Date.now());
    const nonce = randomBytes(16).toString('base64url');
    const bodyHash = createHash('sha256').update(raw).digest('hex');
    const signingKey = createHmac(
      'sha256',
      this.config.getOrThrow('R_RUNTIME_SHARED_SECRET'),
    )
      .update('ecosuitability-r-runtime-v1')
      .digest();
    const signature = createHmac('sha256', signingKey)
      .update(`v1\n${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`)
      .digest('hex');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.getOrThrow('R_RUNTIME_HTTP_TIMEOUT_MS'),
    );
    try {
      const response = await fetch(
        new URL(path, this.config.getOrThrow('R_RUNTIME_URL')),
        {
          method,
          body: body === undefined ? undefined : raw,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Run-Timestamp': timestamp,
            'X-Run-Nonce': nonce,
            'X-Run-Body-SHA256': bodyHash,
            'X-Run-Signature': signature,
          },
        },
      );
      if (!response.ok) {
        throw new RRuntimeError(
          response.status === 409
            ? 'R_RUNTIME_PROTOCOL_INVALID'
            : 'R_RUNTIME_UNAVAILABLE',
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof RRuntimeError) {
        throw error;
      }
      throw new RRuntimeError('R_RUNTIME_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  private async sleep(signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        resolve,
        1000 + Math.floor(Math.random() * 200),
      );
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }
}
