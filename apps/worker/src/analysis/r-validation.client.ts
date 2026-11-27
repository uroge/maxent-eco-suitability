import { Injectable } from '@nestjs/common';
import {
  analysisInputProfileSchema,
  analysisPreflightSchema,
  rValidationEventsPageSchema,
  type AnalysisConfiguration,
  type AnalysisInputDataset,
  type AnalysisInputProfile,
  type AnalysisPreflight,
  type RValidationEvent,
  type RValidationEventsPage,
  type RGeneratedArtifact,
  type RGeneratedMapAsset,
  type RValidationSummary,
} from '@ecosuitability/contracts';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { WorkerEnvironment } from '../env';
import { WorkerStorageService } from '../storage/worker-storage.service';
import { WorkerLifecycleRepository } from './worker-lifecycle.repository';

type ExecutionSnapshot = {
  inputRevision: number;
  configurationRevision: number;
  fingerprint: string;
  inputFingerprint: string;
  configuration: {
    predictors?: Array<{ datasetId: string }>;
  };
  inputManifest: {
    datasets: Array<{
      dataset: { id: string; kind: string; format: string };
      files: Array<{
        storageKey: string;
        originalName: string;
        size: number;
        declaredSha256: string;
        component?: string | null;
      }>;
    }>;
  };
};

type RunAccepted = {
  runId: string;
  eventSequence: number;
  generation: number;
};

type PollingRun = {
  runId: string;
  mode: RValidationEventsPage['mode'];
  inputManifest: ExecutionSnapshot['inputManifest'];
  signal: AbortSignal;
  onHeartbeat: () => Promise<void>;
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
      generation: number,
    ) => Promise<void>,
    onHeartbeat: () => Promise<void>,
    onArtifactsReady: (
      artifacts: RGeneratedArtifact[],
      mapAssets: RGeneratedMapAsset[],
      candidateCompletedAt: string,
    ) => Promise<unknown[]>,
  ): Promise<{
    summary: RValidationSummary;
    artifacts: RGeneratedArtifact[];
    mapAssets: RGeneratedMapAsset[];
  }> {
    const snapshot = await this.snapshot(analysisId);
    const inputManifest = this.selectedManifest(snapshot);
    const runId = `${analysisId}.execute.1`;
    const run = {
      runId,
      mode: 'execute' as const,
      inputManifest,
      signal,
      onHeartbeat,
    };
    const accepted = await this.startRun(run, {
      analysisId,
      jobId,
      attempt,
      configurationFingerprint: snapshot.fingerprint,
      inputFingerprint: snapshot.inputFingerprint,
      inputRevision: snapshot.inputRevision,
      configurationRevision: snapshot.configurationRevision,
      configuration: snapshot.configuration,
      inputManifest,
    });
    let outputCapabilities:
      { generation: number; issuedAt: number } | undefined;

    try {
      const pages = this.pollRun(run, accepted, (event, page) =>
        onEvent(event, page.summary, page.generation),
      );
      for await (const page of pages) {
        if (
          (page.state === 'awaiting-output-capabilities' ||
            page.state === 'running') &&
          page.artifacts &&
          page.mapAssets &&
          page.candidateCompletedAt &&
          (outputCapabilities?.generation !== page.generation ||
            Date.now() - outputCapabilities.issuedAt >=
              this.config.getOrThrow('R_RUNTIME_OUTPUT_URL_TTL_SECONDS') * 750)
        ) {
          const capabilities = await onArtifactsReady(
            page.artifacts,
            page.mapAssets,
            page.candidateCompletedAt,
          );
          await this.request(
            'PUT',
            `/v1/runs/${encodeURIComponent(runId)}/output-capabilities`,
            { capabilities },
            signal,
          );
          outputCapabilities = {
            generation: page.generation,
            issuedAt: Date.now(),
          };
        }

        if (page.state === 'succeeded') {
          if (!page.summary) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          if (!page.artifacts) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          if (!page.mapAssets) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          if (!page.candidateCompletedAt) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          return {
            summary: page.summary,
            artifacts: page.artifacts,
            mapAssets: page.mapAssets,
          };
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
      }
      throw new RRuntimeError('R_RUNTIME_TIMEOUT');
    } catch (error) {
      if (signal.aborted) {
        await this.cancel(runId).catch(() => undefined);
        throw new RRuntimeError('R_RUNTIME_TIMEOUT');
      }
      if (!(error instanceof RRuntimeError)) {
        await this.cancel(runId).catch(() => undefined);
      }
      throw error;
    }
  }

  public async acknowledge(analysisId: string): Promise<void> {
    await this.acknowledgeRun(`${analysisId}.execute.1`);
  }

  public async profileInputs(input: {
    analysisId: string;
    jobId: string;
    attempt: number;
    inputRevision: number;
    inputFingerprint: string;
    inputManifest: { datasets: AnalysisInputDataset[] };
    policyVersion: string;
    createdAt: string;
    signal: AbortSignal;
    onEvent: (event: RValidationEvent, generation: number) => Promise<void>;
    onHeartbeat: () => Promise<void>;
  }): Promise<AnalysisInputProfile> {
    const runId = `${input.analysisId}.profile.${input.inputRevision}`;
    const result = await this.runControlJob({
      ...input,
      runId,
      mode: 'profile',
      request: {
        inputRevision: input.inputRevision,
        inputFingerprint: input.inputFingerprint,
        inputManifest: input.inputManifest,
        policyVersion: input.policyVersion,
        createdAt: input.createdAt,
      },
    });
    return analysisInputProfileSchema.parse(result);
  }

  public async validateInputs(input: {
    analysisId: string;
    jobId: string;
    attempt: number;
    inputRevision: number;
    configurationRevision: number;
    inputFingerprint: string;
    configurationFingerprint: string;
    configuration: AnalysisConfiguration;
    inputManifest: { datasets: AnalysisInputDataset[] };
    policyVersion: string;
    createdAt: string;
    signal: AbortSignal;
    onEvent: (event: RValidationEvent, generation: number) => Promise<void>;
    onHeartbeat: () => Promise<void>;
  }): Promise<AnalysisPreflight> {
    const runId = `${input.analysisId}.validate.${input.inputRevision}.${input.configurationRevision}`;
    const result = await this.runControlJob({
      ...input,
      runId,
      mode: 'validate',
      request: {
        inputRevision: input.inputRevision,
        configurationRevision: input.configurationRevision,
        inputFingerprint: input.inputFingerprint,
        configurationFingerprint: input.configurationFingerprint,
        configuration: input.configuration,
        inputManifest: this.selectedManifest({
          fingerprint: input.configurationFingerprint,
          inputFingerprint: input.inputFingerprint,
          inputRevision: input.inputRevision,
          configurationRevision: input.configurationRevision,
          configuration: input.configuration,
          inputManifest: input.inputManifest,
        }),
        policyVersion: input.policyVersion,
        createdAt: input.createdAt,
      },
    });
    return analysisPreflightSchema.parse(result);
  }

  public async acknowledgeRun(runId: string): Promise<void> {
    await this.request(
      'POST',
      `/v1/runs/${encodeURIComponent(runId)}/complete`,
    );
  }

  public async cancel(runId: string): Promise<void> {
    await this.request('DELETE', `/v1/runs/${encodeURIComponent(runId)}`);
  }

  private async runControlJob(input: {
    analysisId: string;
    jobId: string;
    attempt: number;
    runId: string;
    mode: 'profile' | 'validate';
    inputManifest: { datasets: AnalysisInputDataset[] };
    request: Record<string, unknown>;
    signal: AbortSignal;
    onEvent: (event: RValidationEvent, generation: number) => Promise<void>;
    onHeartbeat: () => Promise<void>;
  }): Promise<unknown> {
    const accepted = await this.startRun(input, {
      analysisId: input.analysisId,
      jobId: input.jobId,
      attempt: input.attempt,
      ...input.request,
    });
    try {
      const pages = this.pollRun(input, accepted, (event, page) =>
        input.onEvent(event, page.generation),
      );
      for await (const page of pages) {
        if (page.state === 'succeeded') {
          if (!page.result) {
            throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
          }
          return page.result;
        }
        if (page.state === 'failed') {
          throw new RRuntimeError(
            page.failureCode ?? 'R_RUNTIME_PROTOCOL_INVALID',
          );
        }
        if (page.state === 'cancelled' || input.signal.aborted) {
          throw new RValidationCancelledError('R validation was cancelled.');
        }
      }
      throw new RRuntimeError('R_RUNTIME_TIMEOUT');
    } catch (error) {
      await this.cancel(input.runId).catch(() => undefined);
      if (input.signal.aborted) {
        if (input.signal.reason instanceof Error) {
          throw input.signal.reason;
        }
        throw new RValidationCancelledError('R validation was cancelled.');
      }
      throw error;
    }
  }

  private async startRun(
    run: PollingRun,
    request: Record<string, unknown>,
  ): Promise<RunAccepted> {
    const accepted = await this.request<RunAccepted>(
      'POST',
      '/v1/runs',
      { runId: run.runId, mode: run.mode, ...request },
      run.signal,
    );
    if (accepted.runId !== run.runId) {
      throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
    }
    await this.refreshCapabilities(run.runId, run.inputManifest, run.signal);
    return accepted;
  }

  private async *pollRun(
    run: PollingRun,
    accepted: RunAccepted,
    onEvent: (
      event: RValidationEvent,
      page: RValidationEventsPage,
    ) => Promise<void>,
  ): AsyncGenerator<RValidationEventsPage> {
    let afterSequence = accepted.eventSequence;
    let generation = accepted.generation;
    let capabilitiesIssuedAt = Date.now();
    const deadline =
      capabilitiesIssuedAt + this.config.getOrThrow('R_RUNTIME_RUN_TIMEOUT_MS');
    const refreshAfter =
      this.config.getOrThrow('R_RUNTIME_INPUT_URL_TTL_SECONDS') * 750;
    while (Date.now() < deadline) {
      await run.onHeartbeat();
      if (Date.now() - capabilitiesIssuedAt >= refreshAfter) {
        await this.refreshCapabilities(
          run.runId,
          run.inputManifest,
          run.signal,
        );
        capabilitiesIssuedAt = Date.now();
      }
      const page = rValidationEventsPageSchema.parse(
        await this.request<unknown>(
          'GET',
          `/v1/runs/${encodeURIComponent(run.runId)}/events?afterSequence=${afterSequence}&limit=100`,
          undefined,
          run.signal,
        ),
      );
      if (page.mode !== run.mode || page.generation < generation) {
        throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
      }
      if (page.generation > generation) {
        generation = page.generation;
        afterSequence = 0;
        if (page.state === 'accepted') {
          await this.refreshCapabilities(
            run.runId,
            run.inputManifest,
            run.signal,
          );
          capabilitiesIssuedAt = Date.now();
        }
        continue;
      }
      if (page.hasMore && page.nextSequence <= afterSequence) {
        throw new RRuntimeError('R_RUNTIME_PROTOCOL_INVALID');
      }
      for (const event of page.events) {
        await onEvent(event, page);
      }
      afterSequence = page.nextSequence;
      run.signal.throwIfAborted();
      if (page.hasMore) {
        continue;
      }
      yield page;
      await delay(1000 + Math.floor(Math.random() * 200), undefined, {
        signal: run.signal,
      });
    }
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
      typeof value.inputRevision !== 'number' ||
      typeof value.configurationRevision !== 'number' ||
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
    signal?.throwIfAborted();
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
}
