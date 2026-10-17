import { createHash } from 'node:crypto';
import { canonicalizeJson } from '@ecosuitability/runtime-utils';
import { describe, expect, it, vi } from 'vitest';
import { RRuntimeError } from './r-validation.client';
import { ValidationJobService } from './validation-job.service';

const analysisId = 'an_0123456789abcdef0123456789abcdef';
const datasetId = 'ds_0123456789abcdef0123456789abcdef';
const timestamp = '2026-10-17T12:00:00.000Z';

const manifest = {
  datasets: [
    {
      dataset: {
        id: datasetId,
        analysisId,
        kind: 'occurrence',
        format: 'csv',
        status: 'ready',
        createdAt: timestamp,
        expiresAt: '2026-10-19T12:00:00.000Z',
      },
      files: [
        {
          uploadId: 'up_0123456789abcdef0123456789abcdef',
          storageKey: `analyses/${analysisId}/inputs/occurrences.csv`,
          originalName: 'occurrences.csv',
          size: 100,
          declaredSha256: 'a'.repeat(64),
          sha256Verification: 'worker-verified',
          contentType: 'text/csv',
          component: null,
        },
      ],
      attachedAt: timestamp,
    },
  ],
};

const inputFingerprint = `jcs-sha256-v1:${createHash('sha256')
  .update(canonicalizeJson(manifest))
  .digest('hex')}`;

const profile = {
  analysisId,
  inputRevision: 1,
  inputFingerprint,
  policyVersion: '2026-10-01',
  status: 'queued',
  progress: 0,
  checks: [],
  warnings: [],
  blockers: [],
  occurrence: {
    columns: [],
    layers: [],
    longitudeCandidates: [],
    latitudeCandidates: [],
    speciesCandidates: [],
    recordCount: null,
    duplicateCoordinateCount: null,
    crs: null,
  },
  rasters: [],
  spatialPreview: null,
  createdAt: timestamp,
  completedAt: null,
} as const;

const payload = { analysisId, ownerId: 'user_123', inputRevision: 1 };

const analysis = {
  ownerId: payload.ownerId,
  inputRevision: 1,
  configurationRevision: 0,
  inputProfile: profile,
};

const createJob = (attemptsMade = 0) => ({
  id: `${analysisId}-profile-1`,
  data: payload,
  attemptsMade,
  opts: { attempts: 3 },
  updateProgress: vi.fn(),
});

const createRedis = (
  mGet = vi
    .fn()
    .mockResolvedValue([JSON.stringify(analysis), JSON.stringify(manifest)]),
) => {
  const evalScript = vi.fn().mockResolvedValue(['updated']);
  return {
    service: { getClient: vi.fn(() => ({ mGet, eval: evalScript })) },
    evalScript,
    mGet,
  };
};

const config = { getOrThrow: vi.fn().mockReturnValue(60_000) };

describe('ValidationJobService', () => {
  it('persists only the typed R profile result for the matching input revision', async () => {
    const redis = createRedis();
    const completed = {
      ...profile,
      status: 'passed',
      progress: 100,
      completedAt: timestamp,
    };
    const runtime = {
      profileInputs: vi.fn().mockResolvedValue(completed),
      acknowledgeRun: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ValidationJobService(
      redis.service as never,
      runtime as never,
      config as never,
    );

    await service.profile(createJob() as never);

    expect(runtime.profileInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        inputRevision: 1,
        inputFingerprint,
        inputManifest: manifest,
      }),
    );
    expect(
      JSON.parse(redis.evalScript.mock.calls.at(-1)?.[1].arguments[4]),
    ).toEqual(completed);
    expect(runtime.acknowledgeRun).toHaveBeenCalledWith(
      `${analysisId}.profile.1`,
    );
  });

  it('cancels and discards an R result when the input revision becomes stale', async () => {
    const mGet = vi
      .fn()
      .mockResolvedValueOnce([
        JSON.stringify(analysis),
        JSON.stringify(manifest),
      ])
      .mockResolvedValueOnce([
        JSON.stringify({
          ...analysis,
          inputRevision: 2,
          inputProfile: undefined,
        }),
        JSON.stringify(manifest),
      ]);
    const redis = createRedis(mGet);
    const runtime = {
      profileInputs: vi.fn(
        async (input: { onHeartbeat: () => Promise<void> }) => {
          await input.onHeartbeat();
          return profile;
        },
      ),
      acknowledgeRun: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ValidationJobService(
      redis.service as never,
      runtime as never,
      config as never,
    );

    await expect(
      service.profile(createJob() as never),
    ).resolves.toBeUndefined();

    expect(runtime.cancel).toHaveBeenCalledWith(`${analysisId}.profile.1`);
    expect(redis.evalScript).not.toHaveBeenCalled();
  });

  it('retries runtime failures and records a terminal failure only on the final attempt', async () => {
    const runtime = {
      profileInputs: vi
        .fn()
        .mockRejectedValue(new RRuntimeError('R_RUNTIME_UNAVAILABLE')),
      acknowledgeRun: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const retryRedis = createRedis();
    const retryService = new ValidationJobService(
      retryRedis.service as never,
      runtime as never,
      config as never,
    );
    await expect(retryService.profile(createJob() as never)).rejects.toThrow(
      'R_RUNTIME_UNAVAILABLE',
    );
    expect(retryRedis.evalScript).not.toHaveBeenCalled();

    const finalRedis = createRedis();
    const finalService = new ValidationJobService(
      finalRedis.service as never,
      runtime as never,
      config as never,
    );
    await expect(
      finalService.profile(createJob(2) as never),
    ).resolves.toBeUndefined();
    const persisted = JSON.parse(
      finalRedis.evalScript.mock.calls[0]?.[1].arguments[4],
    );
    expect(persisted).toMatchObject({
      status: 'failed',
      blockers: ['Scientific validation is temporarily unavailable.'],
    });
  });

  it('runs authoritative preflight with the exact configuration and input fingerprints', async () => {
    const configurationFingerprint = `jcs-sha256-v1:${'b'.repeat(64)}`;
    const configuration = {
      schemaVersion: 1,
      speciesName: 'Lynx lynx',
      occurrence: {
        format: 'csv',
        longitudeColumn: 'longitude',
        latitudeColumn: 'latitude',
      },
      predictors: [
        { datasetId, variableName: 'temperature', type: 'continuous' },
      ],
      studyArea: { strategy: 'predictor-intersection' },
      background: { strategy: 'random', pointCount: 10_000 },
      model: {
        featureClasses: ['linear', 'quadratic'],
        regularizationMultiplier: 1,
      },
      validation: { method: 'k-fold', folds: 5 },
      visualization: { terrain: null },
      seed: 42,
    } as const;
    const preflight = {
      analysisId,
      inputRevision: 1,
      configurationRevision: 2,
      inputFingerprint,
      configurationFingerprint,
      policyVersion: '2026-10-01',
      status: 'queued',
      progress: 0,
      checks: [],
      warnings: [],
      blockers: [],
      createdAt: timestamp,
      completedAt: null,
    } as const;
    const preflightAnalysis = {
      ...analysis,
      configurationRevision: 2,
      configuration,
      configurationFingerprint,
      preflight,
    };
    const redis = createRedis(
      vi
        .fn()
        .mockResolvedValue([
          JSON.stringify(preflightAnalysis),
          JSON.stringify(manifest),
        ]),
    );
    const completed = {
      ...preflight,
      status: 'passed',
      progress: 100,
      completedAt: timestamp,
    };
    const runtime = {
      validateInputs: vi.fn().mockResolvedValue(completed),
      acknowledgeRun: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const service = new ValidationJobService(
      redis.service as never,
      runtime as never,
      config as never,
    );

    await service.preflight({
      ...createJob(),
      id: `${analysisId}-preflight-1-2`,
      data: { ...payload, configurationRevision: 2 },
    } as never);

    expect(runtime.validateInputs).toHaveBeenCalledWith(
      expect.objectContaining({
        inputRevision: 1,
        configurationRevision: 2,
        inputFingerprint,
        configurationFingerprint,
        configuration,
      }),
    );
    expect(runtime.acknowledgeRun).toHaveBeenCalledWith(
      `${analysisId}.validate.1.2`,
    );
  });
});
