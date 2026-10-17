import { Injectable } from '@nestjs/common';
import type {
  AnalysisConfiguration,
  AnalysisInputDataset,
  AnalysisInputProfile,
  AnalysisPreflight,
  AnalysisValidationJobPayload,
} from '@ecosuitability/contracts';
import { RedisService } from '../platform/redis.service';
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
};

@Injectable()
export class ValidationJobService {
  public constructor(private readonly redis: RedisService) {}

  public async profile(payload: AnalysisValidationJobPayload): Promise<void> {
    const loaded = await this.load(payload);
    if (!loaded) {
      return;
    }
    const now = new Date().toISOString();
    const occurrence = loaded.datasets.find(
      (entry) => entry.dataset.kind === 'occurrence',
    );
    const predictors = loaded.datasets.filter(
      (entry) => entry.dataset.kind === 'predictor',
    );
    const requiresMapping = occurrence
      ? ['csv', 'xlsx'].includes(occurrence.dataset.format)
      : false;
    const blockers = requiresMapping
      ? ['Confirm the occurrence coordinate columns in Configuration.']
      : [];
    const profile: AnalysisInputProfile = {
      analysisId: payload.analysisId,
      inputRevision: payload.inputRevision,
      policyVersion,
      status: blockers.length > 0 ? 'blocked' : 'passed',
      progress: 100,
      checks: [
        {
          id: 'inputs.occurrence.present',
          label: 'Occurrence dataset',
          status: occurrence ? 'passed' : 'blocked',
          message: occurrence
            ? 'One occurrence dataset is attached.'
            : 'An occurrence dataset is required.',
        },
        {
          id: 'inputs.predictors.present',
          label: 'Predictor datasets',
          status: predictors.length > 0 ? 'passed' : 'blocked',
          message: `${predictors.length} predictor dataset${predictors.length === 1 ? '' : 's'} attached.`,
        },
        {
          id: 'inputs.duplicates.policy',
          label: 'Duplicate coordinates',
          status: 'warning',
          message:
            'Exact duplicate coordinates are removed deterministically during execution.',
        },
      ],
      warnings: [
        'Exact duplicate coordinates are reported and removed automatically; this is not configurable.',
      ],
      blockers,
      occurrence: {
        columns: [],
        layers: [],
        longitudeCandidates: [],
        latitudeCandidates: [],
        speciesCandidates: [],
        recordCount: null,
        duplicateCoordinateCount: null,
      },
      rasters: [],
      spatialPreview: null,
      createdAt: now,
      completedAt: now,
    };
    await this.finish(payload, 'inputProfile', profile);
  }

  public async preflight(payload: AnalysisValidationJobPayload): Promise<void> {
    const loaded = await this.load(payload);
    if (
      !loaded ||
      !loaded.analysis.configuration ||
      !loaded.analysis.configurationFingerprint
    ) {
      return;
    }
    const configuration = loaded.analysis.configuration;
    const attached = new Set(loaded.datasets.map((entry) => entry.dataset.id));
    const missing = configuration.predictors.filter(
      (predictor) => !attached.has(predictor.datasetId),
    );
    const blockers =
      missing.length > 0
        ? ['One or more configured predictors are no longer attached.']
        : [];
    const now = new Date().toISOString();
    const preflight: AnalysisPreflight = {
      analysisId: payload.analysisId,
      inputRevision: payload.inputRevision,
      configurationRevision: payload.configurationRevision ?? 0,
      configurationFingerprint: loaded.analysis.configurationFingerprint,
      policyVersion,
      status: blockers.length > 0 ? 'blocked' : 'passed',
      progress: 100,
      checks: [
        {
          id: 'configuration.predictors.attached',
          label: 'Configured predictors',
          status: missing.length > 0 ? 'blocked' : 'passed',
          message:
            missing.length > 0
              ? 'Configured predictor inputs changed.'
              : 'Every configured predictor is attached.',
        },
        {
          id: 'configuration.duplicates.authoritative',
          label: 'Duplicate-coordinate policy',
          status: 'passed',
          message: 'Automatic deterministic duplicate removal is enabled.',
        },
      ],
      warnings: [],
      blockers,
      createdAt: now,
      completedAt: now,
    };
    await this.finish(payload, 'preflight', preflight);
  }

  private async load(payload: AnalysisValidationJobPayload): Promise<
    | {
        analysis: ValidationAnalysis;
        datasets: AnalysisInputDataset[];
      }
    | undefined
  > {
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
    const manifest = JSON.parse(manifestPayload) as {
      datasets: AnalysisInputDataset[];
    };
    return { analysis, datasets: manifest.datasets };
  }

  private async finish(
    payload: AnalysisValidationJobPayload,
    kind: 'inputProfile' | 'preflight',
    state: AnalysisInputProfile | AnalysisPreflight,
  ): Promise<void> {
    await this.redis.getClient().eval(FinishValidationJobScript, {
      keys: [`${analysisKeyPrefix}${payload.analysisId}`],
      arguments: [
        payload.ownerId,
        kind,
        String(payload.inputRevision),
        String(payload.configurationRevision ?? 0),
        JSON.stringify(state),
        new Date().toISOString(),
      ],
    });
  }
}
