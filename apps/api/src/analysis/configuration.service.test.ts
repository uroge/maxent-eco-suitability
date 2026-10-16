import { describe, expect, it, vi } from 'vitest';
import type {
  Principal,
  UpdateAnalysisConfigurationRequest,
} from '@ecosuitability/contracts';
import { ConfigurationService } from './configuration.service';

const principal: Principal = {
  userId: 'user_123',
  sessionId: 'sess_123',
  role: 'user',
};

const request: UpdateAnalysisConfigurationRequest = {
  expectedRevision: 0,
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
      featureClasses: ['hinge', 'linear', 'product', 'quadratic'],
      regularizationMultiplier: 1,
    },
    validation: { method: 'train-test-split', testFraction: 0.2 },
    seed: 42,
  },
};

describe('ConfigurationService', () => {
  it('canonicalizes feature classes before persisting a versioned fingerprint', async () => {
    const repository = {
      findOwned: vi.fn(async () => ({ status: 'ready' })),
      inputManifest: vi.fn(async () => ({
        datasets: [
          {
            dataset: {
              id: 'ds_0123456789abcdef0123456789abcdef',
              kind: 'predictor',
              format: 'geotiff',
            },
          },
          { dataset: { kind: 'occurrence', format: 'csv' } },
        ],
      })),
      updateConfiguration: vi.fn(
        async (
          _analysisId,
          _ownerId,
          _key,
          _revision,
          configuration,
          fingerprint,
        ) => ({
          id: 'an_0123456789abcdef0123456789abcdef',
          ownerId: principal.userId,
          configuration,
          configurationRevision: 1,
          configurationFingerprint: fingerprint,
        }),
      ),
    };
    const service = new ConfigurationService(repository as never);

    const result = await service.update(
      principal,
      'an_0123456789abcdef0123456789abcdef',
      'configuration-key-123',
      request,
    );

    expect(result.configuration?.model.featureClasses).toEqual([
      'linear',
      'quadratic',
      'product',
      'hinge',
    ]);
    expect(result.fingerprint).toMatch(/^jcs-sha256-v1:[a-f0-9]{64}$/);
  });

  it('returns frozen snapshots without exposing internal manifest fields', async () => {
    const repository = {
      findOwned: vi.fn(async () => ({
        executionSnapshot: {
          configuration: request.configuration,
          revision: 2,
          fingerprint: 'jcs-sha256-v1:frozen',
          inputManifest: { datasets: [] },
          inputFingerprint: 'jcs-sha256-v1:inputs',
          queuedAt: '2026-09-04T00:00:00.000Z',
          processingExpiresAt: '2026-09-06T00:00:00.000Z',
          seed: 42,
        },
      })),
    };
    const service = new ConfigurationService(repository as never);

    await expect(
      service.get(principal, 'an_0123456789abcdef0123456789abcdef'),
    ).resolves.toEqual({
      mode: 'frozen',
      configuration: request.configuration,
      revision: 2,
      fingerprint: 'jcs-sha256-v1:frozen',
    });
  });
});
