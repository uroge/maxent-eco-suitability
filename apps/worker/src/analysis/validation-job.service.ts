import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  analysisInputDatasetSchema,
  type AnalysisConfiguration,
  type AnalysisInputDataset,
  type AnalysisInputProfile,
  type AnalysisPreflight,
  type AnalysisValidationJobPayload,
  type RValidationEvent,
} from '@ecosuitability/contracts';
import { canonicalizeJson } from '@ecosuitability/runtime-utils';
import type { Job } from 'bullmq';
import { createHash } from 'node:crypto';
import type { WorkerEnvironment } from '../env';
import { RedisService } from '../platform/redis.service';
import {
  RRuntimeError,
  RValidationCancelledError,
  RValidationClient,
} from './r-validation.client';
import { FinishValidationJobScript } from './worker-scripts';

const analysisKeyPrefix = 'ecosuitability:analysis:';
const inputsKeyPrefix = 'ecosuitability:analysis-inputs:';
const policyVersion = '2026-10-01';

type ValidationAnalysis = {
  ownerId: string;
  inputRevision: number;
  configurationRevision: number;
  configuration?: AnalysisConfiguration;
  configurationFingerprint?: string;
  inputProfile?: AnalysisInputProfile;
  preflight?: AnalysisPreflight;
};

type LoadedValidation = {
  analysis: ValidationAnalysis;
  manifest: { datasets: AnalysisInputDataset[] };
  inputFingerprint: string;
};

class StaleValidationJobError extends Error {}

@Injectable()
export class ValidationJobService {
  public constructor(
    private readonly redis: RedisService,
    private readonly runtime: RValidationClient,
    private readonly config: ConfigService<WorkerEnvironment, true>,
  ) {}

  public async profile(job: Job<AnalysisValidationJobPayload>): Promise<void> {
    const loaded = await this.load(job.data);
    if (!loaded) {
      return;
    }
    const initial = loaded.analysis.inputProfile;
    if (!initial || initial.inputFingerprint !== loaded.inputFingerprint) {
      return;
    }
    const runId = `${job.data.analysisId}.profile.${job.data.inputRevision}`;
    await this.run(
      job,
      runId,
      'inputProfile',
      initial,
      async (signal, onEvent, onHeartbeat) =>
        this.runtime.profileInputs({
          analysisId: job.data.analysisId,
          jobId: job.id!,
          attempt: job.attemptsMade + 1,
          inputRevision: job.data.inputRevision,
          inputFingerprint: loaded.inputFingerprint,
          inputManifest: loaded.manifest,
          policyVersion,
          createdAt: initial.createdAt,
          signal,
          onEvent,
          onHeartbeat,
        }),
    );
  }

  public async preflight(
    job: Job<AnalysisValidationJobPayload>,
  ): Promise<void> {
    const loaded = await this.load(job.data);
    const configurationRevision = job.data.configurationRevision;
    if (
      !loaded ||
      configurationRevision === undefined ||
      !loaded.analysis.configuration ||
      !loaded.analysis.configurationFingerprint
    ) {
      return;
    }
    const initial = loaded.analysis.preflight;
    if (
      !initial ||
      initial.inputFingerprint !== loaded.inputFingerprint ||
      initial.configurationFingerprint !==
        loaded.analysis.configurationFingerprint
    ) {
      return;
    }
    const runId = `${job.data.analysisId}.validate.${job.data.inputRevision}.${configurationRevision}`;
    await this.run(
      job,
      runId,
      'preflight',
      initial,
      async (signal, onEvent, onHeartbeat) =>
        this.runtime.validateInputs({
          analysisId: job.data.analysisId,
          jobId: job.id!,
          attempt: job.attemptsMade + 1,
          inputRevision: job.data.inputRevision,
          configurationRevision,
          inputFingerprint: loaded.inputFingerprint,
          configurationFingerprint: loaded.analysis.configurationFingerprint!,
          configuration: loaded.analysis.configuration!,
          inputManifest: loaded.manifest,
          policyVersion,
          createdAt: initial.createdAt,
          signal,
          onEvent,
          onHeartbeat,
        }),
    );
  }

  private async run<T extends AnalysisInputProfile | AnalysisPreflight>(
    job: Job<AnalysisValidationJobPayload>,
    runId: string,
    kind: 'inputProfile' | 'preflight',
    initial: T,
    execute: (
      signal: AbortSignal,
      onEvent: (event: RValidationEvent, generation: number) => Promise<void>,
      onHeartbeat: () => Promise<void>,
    ) => Promise<T>,
  ): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new RRuntimeError('R_RUNTIME_TIMEOUT')),
      this.config.getOrThrow('R_RUNTIME_RUN_TIMEOUT_MS'),
    );
    let state = initial;
    try {
      const result = await execute(
        controller.signal,
        async (event) => {
          state = { ...state, status: 'running', progress: event.percent };
          const outcome = await this.finish(job.data, kind, state);
          if (outcome !== 'updated') {
            controller.abort(new StaleValidationJobError());
            throw new StaleValidationJobError();
          }
          await job.updateProgress({
            stage: event.stage,
            percent: event.percent,
            attempt: job.attemptsMade + 1,
          });
        },
        async () => {
          if (!(await this.isCurrent(job.data))) {
            controller.abort(new StaleValidationJobError());
            throw new StaleValidationJobError();
          }
        },
      );
      const outcome = await this.finish(job.data, kind, result);
      if (outcome === 'updated') {
        await this.runtime.acknowledgeRun(runId).catch(() => undefined);
      } else {
        await this.runtime.cancel(runId).catch(() => undefined);
        await this.runtime.acknowledgeRun(runId).catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof StaleValidationJobError) {
        await this.runtime.cancel(runId).catch(() => undefined);
        await this.runtime.acknowledgeRun(runId).catch(() => undefined);
        return;
      }
      if (error instanceof RValidationCancelledError) {
        return;
      }
      const attempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= attempts;
      if (finalAttempt) {
        const failed = {
          ...state,
          status: 'failed' as const,
          blockers: ['Scientific validation is temporarily unavailable.'],
          completedAt: new Date().toISOString(),
        };
        await this.finish(job.data, kind, failed);
        await this.runtime.cancel(runId).catch(() => undefined);
        await this.runtime.acknowledgeRun(runId).catch(() => undefined);
        return;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async load(
    payload: AnalysisValidationJobPayload,
  ): Promise<LoadedValidation | undefined> {
    const [analysisPayload, manifestPayload] = await this.redis
      .getClient()
      .mGet([
        `${analysisKeyPrefix}${payload.analysisId}`,
        `${inputsKeyPrefix}${payload.analysisId}`,
      ]);
    if (!analysisPayload || !manifestPayload) {
      return undefined;
    }
    const analysis = JSON.parse(analysisPayload) as ValidationAnalysis;
    if (
      analysis.ownerId !== payload.ownerId ||
      analysis.inputRevision !== payload.inputRevision ||
      (payload.configurationRevision !== undefined &&
        analysis.configurationRevision !== payload.configurationRevision)
    ) {
      return undefined;
    }
    const raw = JSON.parse(manifestPayload) as { datasets?: unknown[] };
    const manifest = {
      datasets: (raw.datasets ?? []).map((dataset) =>
        analysisInputDatasetSchema.parse(dataset),
      ),
    };
    return { analysis, manifest, inputFingerprint: this.fingerprint(manifest) };
  }

  private async isCurrent(
    payload: AnalysisValidationJobPayload,
  ): Promise<boolean> {
    return Boolean(await this.load(payload));
  }

  private fingerprint(value: unknown): string {
    return `jcs-sha256-v1:${createHash('sha256').update(canonicalizeJson(value)).digest('hex')}`;
  }

  private async finish(
    payload: AnalysisValidationJobPayload,
    kind: 'inputProfile' | 'preflight',
    state: AnalysisInputProfile | AnalysisPreflight,
  ): Promise<'updated' | 'missing' | 'stale'> {
    const result = (await this.redis
      .getClient()
      .eval(FinishValidationJobScript, {
        keys: [`${analysisKeyPrefix}${payload.analysisId}`],
        arguments: [
          payload.ownerId,
          kind,
          String(payload.inputRevision),
          String(payload.configurationRevision ?? 0),
          JSON.stringify(state),
          new Date().toISOString(),
          kind === 'preflight'
            ? (state as AnalysisPreflight).configurationFingerprint
            : '',
        ],
      })) as string[];
    return result[0] as 'updated' | 'missing' | 'stale';
  }
}
