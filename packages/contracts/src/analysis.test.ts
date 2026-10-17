import { describe, expect, it } from 'vitest';
import {
  analysisIdSchema,
  analysisStatusSchema,
  createAnalysisRequestSchema,
  idempotencyKeySchema,
  analysisConfigurationSchema,
  analysisArtifactSpecifications,
  analysisResultManifestSchema,
  analysisMetricsArtifactSchema,
  mapCapabilitiesSchema,
} from './analysis';

describe('analysis contracts', () => {
  it('accepts every lifecycle state and rejects legacy completed status', () => {
    for (const status of [
      'draft',
      'uploading',
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'expired',
    ]) {
      expect(analysisStatusSchema.safeParse(status).success).toBe(true);
    }

    expect(analysisStatusSchema.safeParse('completed').success).toBe(false);
  });

  it('accepts only opaque analysis IDs and bounded idempotency keys', () => {
    expect(analysisIdSchema.safeParse('an_0123456789abcdef0123456789abcdef').success).toBe(true);
    expect(analysisIdSchema.safeParse('analysis-123').success).toBe(false);
    expect(idempotencyKeySchema.safeParse('request-key-123').success).toBe(true);
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
  });

  it('strips no unknown create fields', () => {
    expect(
      createAnalysisRequestSchema.safeParse({
        displayName: 'Wildcat',
        ownerId: 'user_client_must_not_supply',
      }).success
    ).toBe(false);
  });

  it('normalizes a supported configuration and materializes authoritative defaults', () => {
    const result = analysisConfigurationSchema.parse({
      schemaVersion: 1,
      speciesName: '  Lynx   lynx  ',
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
      seed: 42,
    });

    expect(result.speciesName).toBe('Lynx lynx');
    expect(result.background.pointCount).toBe(10000);
    expect(result.model.featureClasses).toEqual(['linear', 'quadratic', 'product', 'hinge']);
  });

  it('rejects predictor name collisions regardless of case', () => {
    expect(
      analysisConfigurationSchema.safeParse({
        schemaVersion: 1,
        speciesName: 'Lynx lynx',
        occurrence: { format: 'geojson' },
        predictors: [
          {
            datasetId: 'ds_0123456789abcdef0123456789abcdef',
            variableName: 'temperature',
            type: 'continuous',
          },
          {
            datasetId: 'ds_fedcba9876543210fedcba9876543210',
            variableName: 'Temperature',
            type: 'continuous',
          },
        ],
        seed: 42,
      }).success
    ).toBe(false);
  });

  it('supports GeoPackage occurrences and explicit input validation policy', () => {
    const result = analysisConfigurationSchema.parse({
      schemaVersion: 1,
      speciesName: 'Lynx lynx',
      occurrence: { format: 'gpkg', layer: 'observations' },
      predictors: [
        {
          datasetId: 'ds_0123456789abcdef0123456789abcdef',
          variableName: 'land_cover',
          type: 'categorical',
        },
      ],
      inputValidation: {
        coordinatePolicy: 'exclude-invalid',
        coveragePolicy: 'exclude-uncovered',
        minimumCoveragePercent: 80,
      },
      model: { featureClasses: ['linear', 'threshold'], regularizationMultiplier: 1 },
      validation: { method: 'k-fold', folds: 5 },
      seed: 42,
    });

    expect(result.occurrence).toEqual({ format: 'gpkg', layer: 'observations' });
    expect(result.inputValidation?.coveragePolicy).toBe('exclude-uncovered');
    expect(result.validation).toEqual({ method: 'k-fold', folds: 5 });
  });

  it('rejects invalid validation combinations and duplicate feature classes', () => {
    const base = {
      schemaVersion: 1,
      speciesName: 'Lynx lynx',
      occurrence: { format: 'geojson' },
      predictors: [
        {
          datasetId: 'ds_0123456789abcdef0123456789abcdef',
          variableName: 'temperature',
          type: 'continuous',
        },
      ],
      seed: 42,
    };

    expect(
      analysisConfigurationSchema.safeParse({
        ...base,
        validation: { method: 'k-fold', folds: 5, testFraction: 0.2 },
      }).success
    ).toBe(false);
    expect(
      analysisConfigurationSchema.safeParse({
        ...base,
        model: {
          featureClasses: ['linear', 'linear'],
          regularizationMultiplier: 1,
        },
      }).success
    ).toBe(false);
  });

  it('requires exactly one of every scientific result artifact', () => {
    const artifacts = analysisArtifactSpecifications.map((definition, index) => ({
      id: `ar_${String(index).padStart(32, '0')}`,
      kind: definition.kind,
      filename: definition.filename,
      contentType: definition.contentType,
      size: 1,
      sha256: 'a'.repeat(64),
      sha256Verification: 'worker-verified' as const,
      createdAt: '2026-09-02T12:30:00.000Z',
    }));
    const manifest = {
      analysisId: 'an_0123456789abcdef0123456789abcdef',
      completedAt: '2026-09-02T12:30:00.000Z',
      resultExpiresAt: '2026-09-04T12:30:00.000Z',
      artifacts,
    };

    expect(analysisResultManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      analysisResultManifestSchema.safeParse({
        ...manifest,
        artifacts: artifacts.map((artifact) => ({
          ...artifact,
          kind: 'execution-summary' as const,
        })),
      }).success
    ).toBe(false);
  });

  it('validates metrics v2 with pooled ROC and per-run sample counts', () => {
    expect(
      analysisMetricsArtifactSchema.safeParse({
        schemaVersion: 2,
        method: 'k-fold',
        folds: 2,
        pooledRoc: [
          { falsePositiveRate: 0, truePositiveRate: 0, threshold: 1 },
          { falsePositiveRate: 1, truePositiveRate: 1, threshold: 0 },
        ],
        evaluationRuns: [
          { run: 1, auc: 0.8, presenceCount: 12, backgroundCount: 40 },
          { run: 2, auc: 0.9, presenceCount: 11, backgroundCount: 40 },
        ],
        auc: { mean: 0.85, standardDeviation: 0.05, minimum: 0.8, maximum: 0.9 },
        threshold: {
          threshold: 0.4,
          sensitivity: 0.8,
          specificity: 0.75,
          truePositive: 18,
          falseNegative: 5,
          trueNegative: 60,
          falsePositive: 20,
        },
      }).success
    ).toBe(true);
  });

  it('requires an honest terrain capability state', () => {
    const base = {
      analysisId: 'an_0123456789abcdef0123456789abcdef',
      basemaps: [],
      layers: [],
      bounds: [-10, -5, 10, 5],
    };
    expect(
      mapCapabilitiesSchema.safeParse({
        ...base,
        terrain: {
          available: false,
          layerId: null,
          unavailableReason: 'No confirmed elevation predictor.',
        },
      }).success
    ).toBe(true);
    expect(
      mapCapabilitiesSchema.safeParse({
        ...base,
        terrain: { available: true, layerId: 42, unavailableReason: null },
      }).success
    ).toBe(false);
  });
});
