import { describe, expect, it } from 'vitest';
import {
  analysisIdSchema,
  analysisStatusSchema,
  createAnalysisRequestSchema,
  idempotencyKeySchema,
  analysisConfigurationSchema,
  analysisArtifactSpecifications,
  analysisResultManifestSchema,
  analysisBundleManifestSchema,
  analysisMetricsArtifactSchema,
  analysisInputProfileSchema,
  analysisPreflightSchema,
  mapCapabilitiesSchema,
  rGeneratedMapAssetSchema,
  rValidationEventsPageSchema,
  requestInputProfileSchema,
  requestPreflightSchema,
  cancelAnalysisRequestSchema,
  completeAnalysisInputsRequestSchema,
  activeUploadDatasetsResponseSchema,
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

  it('parses sanitized resumable upload metadata', () => {
    const result = activeUploadDatasetsResponseSchema.parse({
      uploads: [
        {
          id: 'ds_0123456789abcdef0123456789abcdef',
          analysisId: 'an_0123456789abcdef0123456789abcdef',
          kind: 'predictor',
          format: 'geotiff',
          status: 'collecting',
          createdAt: '2026-10-17T12:00:00.000Z',
          expiresAt: '2026-10-17T13:00:00.000Z',
          replaceDatasetId: null,
          files: [
            {
              id: 'up_0123456789abcdef0123456789abcdef',
              originalName: 'bio1.tif',
              size: 100,
              sha256: 'a'.repeat(64),
              contentType: 'image/tiff',
              component: null,
              multipart: false,
              partSizeBytes: null,
              status: 'pending',
            },
          ],
        },
      ],
    });
    expect(result.uploads[0]?.files[0]?.originalName).toBe('bio1.tif');
    expect(result.uploads[0]?.files[0]).not.toHaveProperty('storageKey');
  });

  it('binds validation and cancellation intents to explicit lifecycle state', () => {
    expect(
      completeAnalysisInputsRequestSchema.safeParse({ expectedInputRevision: 2 }).success
    ).toBe(true);
    expect(requestInputProfileSchema.safeParse({ expectedInputRevision: 2 }).success).toBe(true);
    expect(
      requestPreflightSchema.safeParse({
        expectedInputRevision: 2,
        expectedConfigurationRevision: 3,
        configurationFingerprint: `jcs-sha256-v1:${'a'.repeat(64)}`,
      }).success
    ).toBe(true);
    expect(cancelAnalysisRequestSchema.safeParse({ expectedStatus: 'running' }).success).toBe(true);
    expect(requestInputProfileSchema.safeParse({ expectedInputRevision: -1 }).success).toBe(false);
    expect(
      completeAnalysisInputsRequestSchema.safeParse({ expectedInputRevision: 0 }).success
    ).toBe(false);
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
      reproducibility: {
        inputRevision: 2,
        configurationRevision: 1,
        inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
        configurationFingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
        seed: 42,
      },
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

  it('validates a non-recursive checksum-bearing bundle manifest', () => {
    const artifacts = analysisArtifactSpecifications
      .filter((definition) => definition.kind !== 'result-bundle')
      .map((definition, index) => ({
        id: `ar_${String(index).padStart(32, '0')}`,
        ...definition,
        size: index + 1,
        sha256: 'a'.repeat(64),
        sha256Verification: 'worker-verified' as const,
        createdAt: '2026-09-02T12:30:00.000Z',
      }));
    const manifest = {
      schemaVersion: 1,
      analysisId: 'an_0123456789abcdef0123456789abcdef',
      completedAt: '2026-09-02T12:30:00.000Z',
      reproducibility: {
        inputRevision: 2,
        configurationRevision: 1,
        inputFingerprint: `jcs-sha256-v1:${'b'.repeat(64)}`,
        configurationFingerprint: `jcs-sha256-v1:${'c'.repeat(64)}`,
        seed: 42,
      },
      artifacts,
    };

    expect(analysisBundleManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      analysisBundleManifestSchema.safeParse({
        ...manifest,
        artifacts: [
          ...artifacts.slice(0, -1),
          {
            ...artifacts[0],
            kind: 'result-bundle',
            filename: 'ecosuitability-results.zip',
            contentType: 'application/zip',
          },
        ],
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

  it('binds terrain eligibility to a verified COG and every DEM check', () => {
    const asset = {
      datasetId: 'ds_0123456789abcdef0123456789abcdef',
      filename: 'ds_0123456789abcdef0123456789abcdef.tif',
      size: 1024,
      sha256: 'a'.repeat(64),
      raster: {
        cog: true,
        overviewCount: 1,
        compression: 'DEFLATE',
        nodata: -9999,
        crs: 'EPSG:4326',
        bounds: [-1, -1, 1, 1],
        resolution: [0.1, 0.1],
        width: 20,
        height: 20,
        dataType: 'FLT4S',
        finiteValueCount: 400,
        minimum: 0,
        maximum: 1000,
      },
      dem: {
        eligible: true,
        reason: null,
        sourceDataType: 'FLT4S',
        dataTypeValid: true,
        unit: 'metre',
        crsTransformable: true,
        resolutionValid: true,
        finiteValuesValid: true,
        rangeValid: true,
      },
    };

    expect(rGeneratedMapAssetSchema.safeParse(asset).success).toBe(true);
    expect(
      rGeneratedMapAssetSchema.safeParse({
        ...asset,
        dem: { ...asset.dem, rangeValid: false },
      }).success
    ).toBe(false);
    expect(
      rGeneratedMapAssetSchema.safeParse({
        ...asset,
        raster: { ...asset.raster, overviewCount: 0 },
      }).success
    ).toBe(false);
  });

  it('binds scientific profiles and preflights to exact revisions and fingerprints', () => {
    const inputFingerprint = `jcs-sha256-v1:${'a'.repeat(64)}`;
    const configurationFingerprint = `jcs-sha256-v1:${'b'.repeat(64)}`;
    const profile = {
      analysisId: 'an_0123456789abcdef0123456789abcdef',
      inputRevision: 2,
      inputFingerprint,
      policyVersion: '2026-10-01',
      status: 'passed',
      progress: 100,
      checks: [
        {
          id: 'rasters.grid.alignment',
          label: 'Raster alignment',
          status: 'passed',
          message: 'Predictor grids share the same geometry.',
        },
      ],
      warnings: [],
      blockers: [],
      occurrence: {
        columns: ['longitude', 'latitude'],
        layers: [],
        longitudeCandidates: ['longitude'],
        latitudeCandidates: ['latitude'],
        speciesCandidates: [],
        recordCount: 12,
        duplicateCoordinateCount: 1,
        crs: 'EPSG:4326',
        sources: [],
      },
      rasters: [
        {
          datasetId: 'ds_0123456789abcdef0123456789abcdef',
          crs: 'EPSG:4326',
          bounds: [0, 0, 10, 10],
          width: 10,
          height: 10,
          resolution: [1, 1],
          bandCount: 1,
          nodata: null,
          alignedToReference: true,
        },
      ],
      spatialPreview: { type: 'FeatureCollection', features: [] },
      createdAt: '2026-10-17T12:00:00.000Z',
      completedAt: '2026-10-17T12:01:00.000Z',
    };
    const preflight = {
      analysisId: profile.analysisId,
      inputRevision: profile.inputRevision,
      configurationRevision: 3,
      inputFingerprint,
      configurationFingerprint,
      policyVersion: profile.policyVersion,
      status: 'passed',
      progress: 100,
      checks: profile.checks,
      warnings: [],
      blockers: [],
      createdAt: profile.createdAt,
      completedAt: profile.completedAt,
    };

    expect(analysisInputProfileSchema.safeParse(profile).success).toBe(true);
    expect(analysisPreflightSchema.safeParse(preflight).success).toBe(true);
    expect(
      analysisInputProfileSchema.safeParse({ ...profile, inputFingerprint: 'unbound' }).success
    ).toBe(false);
    expect(
      analysisPreflightSchema.safeParse({ ...preflight, configurationRevision: -1 }).success
    ).toBe(false);
  });

  it('carries typed profile results through the recoverable R event protocol', () => {
    const profile = analysisInputProfileSchema.parse({
      analysisId: 'an_0123456789abcdef0123456789abcdef',
      inputRevision: 2,
      inputFingerprint: `jcs-sha256-v1:${'a'.repeat(64)}`,
      policyVersion: '2026-10-01',
      status: 'blocked',
      progress: 100,
      checks: [
        {
          id: 'occurrence.mapping.candidates',
          label: 'Occurrence mapping',
          status: 'blocked',
          message: 'The occurrence mapping is ambiguous and must be confirmed.',
        },
      ],
      warnings: [],
      blockers: ['Confirm the occurrence mapping.'],
      occurrence: {
        columns: ['x', 'y'],
        layers: [],
        longitudeCandidates: ['x'],
        latitudeCandidates: ['y'],
        speciesCandidates: [],
        recordCount: 10,
        duplicateCoordinateCount: 0,
        crs: 'EPSG:4326',
      },
      rasters: [],
      spatialPreview: null,
      createdAt: '2026-10-17T12:00:00.000Z',
      completedAt: '2026-10-17T12:01:00.000Z',
    });

    expect(
      rValidationEventsPageSchema.safeParse({
        mode: 'profile',
        generation: 2,
        events: [],
        nextSequence: 0,
        hasMore: false,
        state: 'succeeded',
        summary: null,
        artifacts: null,
        candidateCompletedAt: null,
        failureCode: null,
        result: profile,
      }).success
    ).toBe(true);
  });
});
