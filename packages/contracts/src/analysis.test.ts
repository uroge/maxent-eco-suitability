import { describe, expect, it } from 'vitest';
import {
  analysisIdSchema,
  analysisStatusSchema,
  createAnalysisRequestSchema,
  idempotencyKeySchema,
  analysisConfigurationSchema,
  analysisArtifactSpecifications,
  analysisResultManifestSchema,
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
});
