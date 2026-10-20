import { z } from 'zod';

export const analysisIdSchema = z.string().regex(/^an_[a-z0-9]{32}$/);

export type AnalysisId = z.infer<typeof analysisIdSchema>;

export const analysisStatusSchema = z.enum([
  'draft',
  'uploading',
  'ready',
  'queued',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
]);

export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const analysisFailureSchema = z.object({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(256),
});

export type AnalysisFailure = z.infer<typeof analysisFailureSchema>;

export const analysisStageSchema = z.enum([
  'queued',
  'preparing',
  'validating-inputs',
  'downloading',
  'parsing',
  'validating',
  'sampling-background',
  'training',
  'evaluating',
  'projecting',
  'writing-artifacts',
  'uploading-artifacts',
  'executing',
  'finalizing',
  'retrying',
  'cancelled',
  'completed',
  'failed',
]);

export type AnalysisStage = z.infer<typeof analysisStageSchema>;

export const analysisProgressSchema = z.object({
  stage: analysisStageSchema,
  percent: z.number().int().min(0).max(100),
  attempt: z.number().int().positive().nullable(),
  message: z.string().min(1).max(256).nullable().optional(),
  updatedAt: z.string().datetime(),
});

export type AnalysisProgress = z.infer<typeof analysisProgressSchema>;

export const analysisExecutionSchema = z.object({
  jobId: z.string().min(1).max(128).nullable(),
  attempt: z.number().int().positive().nullable(),
  outboxDispatchedAt: z.string().datetime().nullable(),
});

export type AnalysisExecution = z.infer<typeof analysisExecutionSchema>;

export const analysisSchema = z.object({
  id: analysisIdSchema,
  status: analysisStatusSchema,
  displayName: z.string().min(1).max(120).nullable(),
  inputRevision: z.number().int().nonnegative(),
  configurationRevision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  expiredAt: z.string().datetime().nullable(),
  queuedAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  failure: analysisFailureSchema.nullable(),
  progress: analysisProgressSchema.nullable(),
  execution: analysisExecutionSchema.nullable(),
});

export type Analysis = z.infer<typeof analysisSchema>;

export const createAnalysisRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type CreateAnalysisRequest = z.infer<typeof createAnalysisRequestSchema>;

export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/);

export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;

export const analysisResponseSchema = z.object({ analysis: analysisSchema });

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export const analysisTransitionSchema = z.object({
  from: analysisStatusSchema,
  to: analysisStatusSchema,
});

export type AnalysisTransition = z.infer<typeof analysisTransitionSchema>;

export const analysisJobPayloadSchema = z.object({
  analysisId: analysisIdSchema,
  ownerId: z.string().min(1).max(128),
});

export type AnalysisJobPayload = z.infer<typeof analysisJobPayloadSchema>;

export const analysisOutboxStatusSchema = z.enum(['pending', 'dispatched']);

export type AnalysisOutboxStatus = z.infer<typeof analysisOutboxStatusSchema>;

export const analysisWorkerClaimOutcomeSchema = z.enum([
  'claimed',
  'already_running_same_attempt',
  'cancelled',
  'terminal',
  'stale_attempt',
  'dependency_unavailable',
]);

export type AnalysisWorkerClaimOutcome = z.infer<typeof analysisWorkerClaimOutcomeSchema>;

export const analysisQueueName = 'analysis-execution';

export const analysisQueuePrefix = 'ecosuitability';

export const analysisJobName = 'run-analysis';

export const analysisInputProfileJobName = 'input-profile';

export const analysisPreflightJobName = 'preflight';

export const analysisValidationJobPayloadSchema = analysisJobPayloadSchema.extend({
  inputRevision: z.number().int().nonnegative(),
  configurationRevision: z.number().int().nonnegative().optional(),
});

export type AnalysisValidationJobPayload = z.infer<typeof analysisValidationJobPayloadSchema>;

export const sha256VerificationSchema = z.enum(['client-declared', 'worker-verified']);

export type Sha256Verification = z.infer<typeof sha256VerificationSchema>;

export const uploadDatasetIdSchema = z.string().regex(/^ds_[a-z0-9]{32}$/);

export type UploadDatasetId = z.infer<typeof uploadDatasetIdSchema>;

export const uploadIdSchema = z.string().regex(/^up_[a-z0-9]{32}$/);

export type UploadId = z.infer<typeof uploadIdSchema>;

export const uploadDatasetKindSchema = z.enum(['occurrence', 'predictor']);

export type UploadDatasetKind = z.infer<typeof uploadDatasetKindSchema>;

export const uploadDatasetFormatSchema = z.enum([
  'csv',
  'xlsx',
  'geojson',
  'gpkg',
  'shapefile',
  'geotiff',
  'geotiff-zip',
]);

export type UploadDatasetFormat = z.infer<typeof uploadDatasetFormatSchema>;

export const shapefileComponentSchema = z.enum(['shp', 'shx', 'dbf', 'prj', 'cpg']);

export type ShapefileComponent = z.infer<typeof shapefileComponentSchema>;

export const uploadDatasetStatusSchema = z.enum([
  'collecting',
  'completing',
  'ready',
  'invalid',
  'aborted',
]);

export type UploadDatasetStatus = z.infer<typeof uploadDatasetStatusSchema>;

export const uploadFileStatusSchema = z.enum(['pending', 'completed', 'aborted']);

export type UploadFileStatus = z.infer<typeof uploadFileStatusSchema>;

export const uploadFileSchema = z
  .object({
    originalName: z.string().min(1).max(255),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    contentType: z.string().max(128).optional(),
    component: shapefileComponentSchema.optional(),
  })
  .strict();

export type UploadFile = z.infer<typeof uploadFileSchema>;

export const createUploadDatasetRequestSchema = z
  .object({
    kind: uploadDatasetKindSchema,
    format: uploadDatasetFormatSchema,
  })
  .strict();

export type CreateUploadDatasetRequest = z.infer<typeof createUploadDatasetRequestSchema>;

export const createUploadFileRequestSchema = uploadFileSchema;

export type CreateUploadFileRequest = z.infer<typeof createUploadFileRequestSchema>;

export const uploadPartSchema = z.object({
  partNumber: z.number().int().positive().max(10000),
  etag: z.string().min(1).max(512),
});

export type UploadPart = z.infer<typeof uploadPartSchema>;

export const completeUploadRequestSchema = z
  .object({
    parts: z.array(uploadPartSchema).max(10000).default([]),
  })
  .strict();

export type CompleteUploadRequest = z.infer<typeof completeUploadRequestSchema>;

export const uploadPartRequestSchema = z
  .object({
    partNumbers: z.array(z.number().int().positive().max(10000)).min(1).max(20),
  })
  .strict();

export type UploadPartRequest = z.infer<typeof uploadPartRequestSchema>;

export const uploadFileResponseSchema = z.object({
  id: uploadIdSchema,
  multipart: z.boolean(),
  uploadUrl: z.string().url().nullable(),
  partSizeBytes: z.number().int().positive().nullable(),
});

export type UploadFileResponse = z.infer<typeof uploadFileResponseSchema>;

export const uploadDatasetSchema = z.object({
  id: uploadDatasetIdSchema,
  analysisId: analysisIdSchema,
  kind: uploadDatasetKindSchema,
  format: uploadDatasetFormatSchema,
  status: uploadDatasetStatusSchema,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type UploadDataset = z.infer<typeof uploadDatasetSchema>;

export const uploadDatasetResponseSchema = z.object({
  dataset: uploadDatasetSchema,
});

export type UploadDatasetResponse = z.infer<typeof uploadDatasetResponseSchema>;

export const analysisInputFileSchema = z.object({
  uploadId: uploadIdSchema,
  storageKey: z.string().min(1).max(1024),
  originalName: z.string().min(1).max(255),
  size: z.number().int().positive(),
  declaredSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sha256Verification: sha256VerificationSchema,
  contentType: z.string().max(128).nullable(),
  component: shapefileComponentSchema.nullable(),
});

export type AnalysisInputFile = z.infer<typeof analysisInputFileSchema>;

export const analysisInputDatasetSchema = z.object({
  dataset: uploadDatasetSchema,
  files: z.array(analysisInputFileSchema).min(1).max(5),
  attachedAt: z.string().datetime(),
});

export type AnalysisInputDataset = z.infer<typeof analysisInputDatasetSchema>;

export const analysisInputFileSummarySchema = analysisInputFileSchema.omit({
  storageKey: true,
});

export type AnalysisInputFileSummary = z.infer<typeof analysisInputFileSummarySchema>;

export const analysisInputDatasetSummarySchema = z.object({
  dataset: uploadDatasetSchema,
  files: z.array(analysisInputFileSummarySchema).min(1).max(5),
  attachedAt: z.string().datetime(),
});

export type AnalysisInputDatasetSummary = z.infer<typeof analysisInputDatasetSummarySchema>;

export const analysisInputManifestSchema = z.object({
  analysisId: analysisIdSchema,
  inputRevision: z.number().int().nonnegative(),
  datasets: z.array(analysisInputDatasetSummarySchema),
});

export type AnalysisInputManifest = z.infer<typeof analysisInputManifestSchema>;

export const analysisInputManifestResponseSchema = z.object({
  inputs: analysisInputManifestSchema,
});

export type AnalysisInputManifestResponse = z.infer<typeof analysisInputManifestResponseSchema>;

export const analysisArtifactIdSchema = z.string().regex(/^ar_[a-z0-9]{32}$/);

export type AnalysisArtifactId = z.infer<typeof analysisArtifactIdSchema>;

export const scientificArtifactKinds = [
  'execution-summary',
  'metrics',
  'variable-importance',
  'response-curves',
  'suitability-raster',
  'suitability-threshold-raster',
  'occurrences',
  'background',
  'run-log',
] as const;

export const analysisArtifactKinds = [...scientificArtifactKinds, 'result-bundle'] as const;

export const analysisArtifactKindSchema = z.enum(analysisArtifactKinds);

export const scientificArtifactKindSchema = z.enum(scientificArtifactKinds);

export type ScientificArtifactKind = z.infer<typeof scientificArtifactKindSchema>;

export type AnalysisArtifactKind = z.infer<typeof analysisArtifactKindSchema>;

export const analysisArtifactSpecifications: ReadonlyArray<{
  kind: AnalysisArtifactKind;
  filename: string;
  contentType: string;
}> = [
  {
    kind: 'execution-summary',
    filename: 'execution-summary.json',
    contentType: 'application/json',
  },
  { kind: 'metrics', filename: 'metrics.json', contentType: 'application/json' },
  {
    kind: 'variable-importance',
    filename: 'variable-importance.json',
    contentType: 'application/json',
  },
  { kind: 'response-curves', filename: 'response-curves.json', contentType: 'application/json' },
  { kind: 'suitability-raster', filename: 'suitability.tif', contentType: 'image/tiff' },
  {
    kind: 'suitability-threshold-raster',
    filename: 'suitability-threshold.tif',
    contentType: 'image/tiff',
  },
  { kind: 'occurrences', filename: 'occurrences.geojson', contentType: 'application/geo+json' },
  { kind: 'background', filename: 'background.geojson', contentType: 'application/geo+json' },
  { kind: 'run-log', filename: 'run.log.txt', contentType: 'text/plain; charset=utf-8' },
  { kind: 'result-bundle', filename: 'ecosuitability-results.zip', contentType: 'application/zip' },
];

export const scientificArtifactSpecifications = analysisArtifactSpecifications.filter(
  (artifact) => artifact.kind !== 'result-bundle'
) as ReadonlyArray<{
  kind: ScientificArtifactKind;
  filename: string;
  contentType: string;
}>;

export const workerSha256VerificationSchema = z.literal('worker-verified');

export type WorkerSha256Verification = z.infer<typeof workerSha256VerificationSchema>;

export const analysisArtifactSchema = z.object({
  id: analysisArtifactIdSchema,
  kind: analysisArtifactKindSchema,
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sha256Verification: workerSha256VerificationSchema,
  createdAt: z.string().datetime(),
});

export type AnalysisArtifact = z.infer<typeof analysisArtifactSchema>;

const completeArtifactSet = <T extends { kind: AnalysisArtifactKind }>(artifacts: T[]): boolean =>
  artifacts.length === analysisArtifactKinds.length &&
  new Set(artifacts.map((artifact) => artifact.kind)).size === analysisArtifactKinds.length &&
  analysisArtifactKinds.every((kind) => artifacts.some((artifact) => artifact.kind === kind));

export const analysisResultManifestSchema = z
  .object({
    analysisId: analysisIdSchema,
    completedAt: z.string().datetime(),
    resultExpiresAt: z.string().datetime(),
    artifacts: z.array(analysisArtifactSchema).length(analysisArtifactKinds.length),
  })
  .superRefine((value, context) => {
    if (!completeArtifactSet(value.artifacts)) {
      context.addIssue({
        code: 'custom',
        message: 'Result manifest must contain every artifact once.',
      });
    }
  });

export type AnalysisResultManifest = z.infer<typeof analysisResultManifestSchema>;

export const analysisResultManifestResponseSchema = z.object({
  result: analysisResultManifestSchema,
});

export type AnalysisResultManifestResponse = z.infer<typeof analysisResultManifestResponseSchema>;

export const analysisArtifactDownloadResponseSchema = z.object({
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export type AnalysisArtifactDownloadResponse = z.infer<
  typeof analysisArtifactDownloadResponseSchema
>;

const normalizedText = z
  .string()
  .transform((value) => value.normalize('NFC').trim().replace(/\s+/g, ' '))
  .refine(
    (value) => value.length > 0 && value.length <= 120 && !/[\u0000-\u001F\u007F]/.test(value)
  );

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[\u0000-\u001F\u007F]/.test(value));

const featureClassSchema = z.enum(['linear', 'quadratic', 'product', 'hinge', 'threshold']);

export const analysisConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    speciesName: normalizedText,
    occurrence: z.discriminatedUnion('format', [
      z
        .object({
          format: z.literal('csv'),
          longitudeColumn: identifierSchema,
          latitudeColumn: identifierSchema,
          speciesColumn: identifierSchema.optional(),
        })
        .strict(),
      z
        .object({
          format: z.literal('xlsx'),
          worksheet: identifierSchema,
          longitudeColumn: identifierSchema,
          latitudeColumn: identifierSchema,
          speciesColumn: identifierSchema.optional(),
        })
        .strict(),
      z.object({ format: z.literal('geojson') }).strict(),
      z
        .object({
          format: z.literal('gpkg'),
          layer: identifierSchema.optional(),
        })
        .strict(),
      z.object({ format: z.literal('shapefile') }).strict(),
    ]),
    predictors: z
      .array(
        z
          .object({
            datasetId: uploadDatasetIdSchema,
            variableName: z
              .string()
              .trim()
              .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
            type: z.enum(['continuous', 'categorical']),
          })
          .strict()
      )
      .min(1),
    studyArea: z
      .object({ strategy: z.literal('predictor-intersection') })
      .strict()
      .default({ strategy: 'predictor-intersection' }),
    inputValidation: z
      .object({
        coordinatePolicy: z.enum(['reject-all', 'exclude-invalid']),
        coveragePolicy: z.enum(['require-all', 'exclude-uncovered']),
        minimumCoveragePercent: z.number().int().min(80).max(100),
      })
      .strict()
      .optional(),
    background: z
      .object({
        strategy: z.literal('random').default('random'),
        pointCount: z.number().int().min(1000).max(100000).default(10000),
      })
      .strict()
      .default({ strategy: 'random', pointCount: 10000 }),
    model: z
      .object({
        featureClasses: z
          .array(featureClassSchema)
          .min(1)
          .default(['linear', 'quadratic', 'product', 'hinge']),
        regularizationMultiplier: z.number().finite().min(0.5).max(5).default(1),
      })
      .strict()
      .default({
        featureClasses: ['linear', 'quadratic', 'product', 'hinge'],
        regularizationMultiplier: 1,
      }),
    validation: z
      .discriminatedUnion('method', [
        z
          .object({
            method: z.literal('train-test-split'),
            testFraction: z.number().finite().min(0.1).max(0.5).default(0.2),
          })
          .strict(),
        z
          .object({
            method: z.literal('k-fold'),
            folds: z.number().int().min(2).max(10).default(5),
          })
          .strict(),
      ])
      .default({ method: 'train-test-split', testFraction: 0.2 }),
    visualization: z
      .object({
        terrain: z
          .object({
            datasetId: uploadDatasetIdSchema,
            semanticType: z.literal('elevation'),
            unit: z.literal('metres'),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .default({ terrain: null }),
    seed: z.number().int().min(0).max(4294967295),
  })
  .strict()
  .superRefine((value, context) => {
    const names = new Set<string>();
    const datasets = new Set<string>();
    for (const predictor of value.predictors) {
      const name = predictor.variableName.toLowerCase();
      if (names.has(name) || datasets.has(predictor.datasetId)) {
        context.addIssue({
          code: 'custom',
          message: 'Predictors must have unique dataset IDs and variable names.',
        });
      }
      names.add(name);
      datasets.add(predictor.datasetId);
    }
    if (new Set(value.model.featureClasses).size !== value.model.featureClasses.length) {
      context.addIssue({ code: 'custom', message: 'Feature classes must be unique.' });
    }
    if (value.visualization.terrain) {
      const terrainPredictor = value.predictors.find(
        (predictor) => predictor.datasetId === value.visualization.terrain?.datasetId
      );
      if (!terrainPredictor || terrainPredictor.type !== 'continuous') {
        context.addIssue({
          code: 'custom',
          message: 'Terrain must reference a selected continuous predictor.',
          path: ['visualization', 'terrain', 'datasetId'],
        });
      }
    }
  });

export type AnalysisConfiguration = z.infer<typeof analysisConfigurationSchema>;

export const updateAnalysisConfigurationRequestSchema = z
  .object({ expectedRevision: z.number().int().min(0), configuration: analysisConfigurationSchema })
  .strict();

export type UpdateAnalysisConfigurationRequest = z.infer<
  typeof updateAnalysisConfigurationRequestSchema
>;

export const analysisConfigurationResponseSchema = z.object({
  mode: z.enum(['editable', 'frozen']),
  configuration: analysisConfigurationSchema.nullable(),
  revision: z.number().int().min(0),
  fingerprint: z.string().optional(),
});

export type AnalysisConfigurationResponse = z.infer<typeof analysisConfigurationResponseSchema>;

export const analysisCheckStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'warning',
  'blocked',
]);

export type AnalysisCheckStatus = z.infer<typeof analysisCheckStatusSchema>;

export const analysisValidationCheckSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,95}$/),
    label: z.string().min(1).max(120),
    status: analysisCheckStatusSchema,
    message: z.string().min(1).max(512),
  })
  .strict();

export type AnalysisValidationCheck = z.infer<typeof analysisValidationCheckSchema>;

export const rasterMetadataSchema = z
  .object({
    datasetId: uploadDatasetIdSchema,
    crs: z.string().min(1).max(4096),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    resolution: z.tuple([z.number().positive(), z.number().positive()]),
    bandCount: z.number().int().positive(),
    nodata: z.number().finite().nullable(),
    alignedToReference: z.boolean(),
  })
  .strict();

export type RasterMetadata = z.infer<typeof rasterMetadataSchema>;

export const canonicalFingerprintSchema = z.string().regex(/^jcs-sha256-v1:[a-f0-9]{64}$/);

const spatialPreviewSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(z.unknown()).max(5000),
  })
  .strict();

export const analysisInputProfileSchema = z
  .object({
    analysisId: analysisIdSchema,
    inputRevision: z.number().int().nonnegative(),
    inputFingerprint: canonicalFingerprintSchema,
    policyVersion: z.string().min(1).max(32),
    status: z.enum(['queued', 'running', 'passed', 'blocked', 'failed']),
    progress: z.number().int().min(0).max(100),
    checks: z.array(analysisValidationCheckSchema),
    warnings: z.array(z.string().min(1).max(512)),
    blockers: z.array(z.string().min(1).max(512)),
    occurrence: z
      .object({
        columns: z.array(z.string().min(1).max(255)),
        layers: z.array(z.string().min(1).max(255)),
        longitudeCandidates: z.array(z.string().min(1).max(255)),
        latitudeCandidates: z.array(z.string().min(1).max(255)),
        speciesCandidates: z.array(z.string().min(1).max(255)),
        recordCount: z.number().int().nonnegative().nullable(),
        duplicateCoordinateCount: z.number().int().nonnegative().nullable(),
        crs: z.string().min(1).max(4096).nullable(),
      })
      .strict(),
    rasters: z.array(rasterMetadataSchema),
    spatialPreview: spatialPreviewSchema.nullable(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();

export type AnalysisInputProfile = z.infer<typeof analysisInputProfileSchema>;

export const analysisInputProfileResponseSchema = z.object({
  profile: analysisInputProfileSchema,
});

export type AnalysisInputProfileResponse = z.infer<typeof analysisInputProfileResponseSchema>;

export const analysisPreflightSchema = z
  .object({
    analysisId: analysisIdSchema,
    inputRevision: z.number().int().nonnegative(),
    configurationRevision: z.number().int().nonnegative(),
    inputFingerprint: canonicalFingerprintSchema,
    configurationFingerprint: canonicalFingerprintSchema,
    policyVersion: z.string().min(1).max(32),
    status: z.enum(['queued', 'running', 'passed', 'blocked', 'failed']),
    progress: z.number().int().min(0).max(100),
    checks: z.array(analysisValidationCheckSchema),
    warnings: z.array(z.string().min(1).max(512)),
    blockers: z.array(z.string().min(1).max(512)),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();

export type AnalysisPreflight = z.infer<typeof analysisPreflightSchema>;

export const analysisPreflightResponseSchema = z.object({ preflight: analysisPreflightSchema });

export type AnalysisPreflightResponse = z.infer<typeof analysisPreflightResponseSchema>;

export const rJobModeSchema = z.enum(['profile', 'validate', 'execute']);

export type RJobMode = z.infer<typeof rJobModeSchema>;

export const queueAnalysisRequestSchema = z
  .object({
    expectedInputRevision: z.number().int().nonnegative(),
    expectedConfigurationRevision: z.number().int().positive(),
    configurationFingerprint: canonicalFingerprintSchema,
  })
  .strict();

export type QueueAnalysisRequest = z.infer<typeof queueAnalysisRequestSchema>;

export const scientificValidationFailureCodeSchema = z.enum([
  'INPUT_RESOURCE_LIMIT_EXCEEDED',
  'OCCURRENCE_RECORD_LIMIT_EXCEEDED',
  'OCCURRENCE_FILE_UNREADABLE',
  'OCCURRENCE_FORMAT_INVALID',
  'OCCURRENCE_SCHEMA_INVALID',
  'OCCURRENCE_COORDINATES_INVALID',
  'OCCURRENCE_SPECIES_INVALID',
  'OCCURRENCE_MINIMUM_NOT_MET',
  'OCCURRENCE_PARTITION_INVALID',
  'OCCURRENCE_GEOMETRY_INVALID',
  'OCCURRENCE_CRS_MISSING',
  'OCCURRENCE_CRS_INCOMPATIBLE',
  'OCCURRENCE_GPKG_LAYER_INVALID',
  'OCCURRENCE_GPKG_LAYER_AMBIGUOUS',
  'OCCURRENCE_COVERAGE_THRESHOLD_NOT_MET',
  'PREDICTOR_FILE_UNREADABLE',
  'PREDICTOR_ARCHIVE_INVALID',
  'PREDICTOR_ARCHIVE_LIMIT_EXCEEDED',
  'PREDICTOR_GEOTIFF_INVALID',
  'PREDICTOR_LAYER_COUNT_INVALID',
  'PREDICTOR_CRS_INCOMPATIBLE',
  'PREDICTOR_GRID_INCOMPATIBLE',
  'PREDICTOR_VALUES_INVALID',
  'PREDICTOR_CATEGORICAL_INVALID',
  'PREDICTOR_COVERAGE_INSUFFICIENT',
  'BACKGROUND_CAPACITY_INSUFFICIENT',
  'MODEL_TRAINING_FAILED',
  'MODEL_EVALUATION_FAILED',
  'MODEL_PROJECTION_FAILED',
  'MODEL_THRESHOLD_INVALID',
  'MODEL_ARTIFACT_GENERATION_FAILED',
]);

export type ScientificValidationFailureCode = z.infer<typeof scientificValidationFailureCodeSchema>;

export const rValidationEventsResponseSchema = z.object({
  mode: rJobModeSchema,
  events: z
    .array(
      z.object({
        sequence: z.number().int().nonnegative(),
        stage: z.enum([
          'accepted',
          'downloading',
          'parsing',
          'validating',
          'sampling-background',
          'training',
          'evaluating',
          'projecting',
          'writing-artifacts',
          'uploading-artifacts',
          'completed',
        ]),
        percent: z.number().int().min(0).max(100),
        message: z.string().max(256),
      })
    )
    .max(100),
  nextSequence: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  state: z.enum([
    'accepted',
    'running',
    'awaiting-output-capabilities',
    'succeeded',
    'failed',
    'cancelling',
    'cancelled',
  ]),
  summary: z
    .object({
      acceptedOccurrences: z.number().int().nonnegative(),
      deduplicatedOccurrences: z.number().int().nonnegative(),
      invalidCoordinateOccurrences: z.number().int().nonnegative().default(0),
      uncoveredOccurrences: z.number().int().nonnegative().default(0),
      coveragePercent: z.number().finite().min(0).max(100).default(100),
      selectedPredictors: z.number().int().positive(),
      validatedAt: z.string().datetime(),
    })
    .nullable(),
  artifacts: z.array(z.unknown()).nullable(),
  mapAssets: z.array(z.unknown()).nullable().default(null),
  candidateCompletedAt: z.string().datetime().nullable(),
  failureCode: z
    .union([
      scientificValidationFailureCodeSchema,
      z.enum([
        'R_RUNTIME_UNAVAILABLE',
        'R_RUNTIME_TIMEOUT',
        'R_RUNTIME_PROTOCOL_INVALID',
        'R_RUNTIME_CANCEL_FAILED',
      ]),
    ])
    .nullable(),
  result: z.union([analysisInputProfileSchema, analysisPreflightSchema]).nullable(),
});

export type RValidationEventsResponse = z.infer<typeof rValidationEventsResponseSchema>;

export const rRuntimeFailureCodeSchema = z.enum([
  'R_RUNTIME_UNAVAILABLE',
  'R_RUNTIME_TIMEOUT',
  'R_RUNTIME_PROTOCOL_INVALID',
  'R_RUNTIME_CANCEL_FAILED',
]);

export type RRuntimeFailureCode = z.infer<typeof rRuntimeFailureCodeSchema>;

export const rValidationFailureCodeSchema = z.union([
  scientificValidationFailureCodeSchema,
  rRuntimeFailureCodeSchema,
]);

export type RValidationFailureCode = z.infer<typeof rValidationFailureCodeSchema>;

export const rValidationEventSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    stage: z.enum([
      'accepted',
      'downloading',
      'parsing',
      'validating',
      'sampling-background',
      'training',
      'evaluating',
      'projecting',
      'writing-artifacts',
      'uploading-artifacts',
      'completed',
    ]),
    percent: z.number().int().min(0).max(100),
    message: z.string().min(1).max(256),
  })
  .strict();

export type RValidationEvent = z.infer<typeof rValidationEventSchema>;

export const rValidationRunStateSchema = z.enum([
  'accepted',
  'running',
  'awaiting-output-capabilities',
  'succeeded',
  'failed',
  'cancelling',
  'cancelled',
]);

export type RValidationRunState = z.infer<typeof rValidationRunStateSchema>;

export const rValidationSummarySchema = z
  .object({
    acceptedOccurrences: z.number().int().nonnegative(),
    deduplicatedOccurrences: z.number().int().nonnegative(),
    invalidCoordinateOccurrences: z.number().int().nonnegative().default(0),
    uncoveredOccurrences: z.number().int().nonnegative().default(0),
    coveragePercent: z.number().finite().min(0).max(100).default(100),
    selectedPredictors: z.number().int().positive(),
    validatedAt: z.string().datetime(),
  })
  .strict();

export type RValidationSummary = z.infer<typeof rValidationSummarySchema>;

export const analysisThresholdMetricsSchema = z
  .object({
    threshold: z.number().finite().min(0).max(1),
    sensitivity: z.number().finite().min(0).max(1),
    specificity: z.number().finite().min(0).max(1),
    truePositive: z.number().int().nonnegative(),
    falseNegative: z.number().int().nonnegative(),
    trueNegative: z.number().int().nonnegative(),
    falsePositive: z.number().int().nonnegative(),
  })
  .strict();

export const analysisMetricsArtifactSchema = z
  .object({
    schemaVersion: z.literal(2),
    method: z.enum(['train-test-split', 'k-fold']),
    folds: z.number().int().positive(),
    pooledRoc: z
      .array(
        z
          .object({
            falsePositiveRate: z.number().finite().min(0).max(1),
            truePositiveRate: z.number().finite().min(0).max(1),
            threshold: z.number().finite(),
          })
          .strict()
      )
      .min(2),
    evaluationRuns: z
      .array(
        z
          .object({
            run: z.number().int().positive(),
            auc: z.number().finite().min(0).max(1),
            presenceCount: z.number().int().nonnegative(),
            backgroundCount: z.number().int().nonnegative(),
          })
          .strict()
      )
      .min(1),
    auc: z
      .object({
        mean: z.number().finite().min(0).max(1),
        standardDeviation: z.number().finite().nonnegative(),
        minimum: z.number().finite().min(0).max(1),
        maximum: z.number().finite().min(0).max(1),
      })
      .strict(),
    threshold: analysisThresholdMetricsSchema,
  })
  .strict();

export type AnalysisMetricsArtifact = z.infer<typeof analysisMetricsArtifactSchema>;

export const analysisResultOverviewSchema = z
  .object({
    analysisId: analysisIdSchema,
    displayName: z.string().min(1).max(120).nullable(),
    completedAt: z.string().datetime(),
    resultExpiresAt: z.string().datetime(),
    metrics: analysisMetricsArtifactSchema,
    validation: rValidationSummarySchema,
    configuration: analysisConfigurationSchema,
  })
  .strict();

export const analysisResultOverviewResponseSchema = z.object({
  overview: analysisResultOverviewSchema,
});

export type AnalysisResultOverviewResponse = z.infer<typeof analysisResultOverviewResponseSchema>;

export const analysisDiagnosticsSchema = z
  .object({
    metrics: analysisMetricsArtifactSchema,
    importance: z.unknown(),
    responseCurves: z.unknown(),
  })
  .strict();

export const analysisDiagnosticsResponseSchema = z.object({
  diagnostics: analysisDiagnosticsSchema,
});

export type AnalysisDiagnosticsResponse = z.infer<typeof analysisDiagnosticsResponseSchema>;

export const mapBasemapSchema = z
  .object({
    id: z.enum(['light', 'satellite', 'terrain']),
    label: z.string().min(1).max(64),
    styleUrl: z.string().url(),
    attribution: z.string().min(1).max(512),
  })
  .strict();

export const mapLayerIdSchema = z.string().regex(/^(?:ar|ml)_[a-z0-9]{32}$/);

export const mapLayerSchema = z
  .object({
    id: mapLayerIdSchema,
    label: z.string().min(1).max(120),
    kind: z.enum(['suitability', 'threshold', 'predictor', 'occurrences', 'background']),
    dataType: z.enum(['raster', 'vector']),
    legend: z
      .array(
        z.object({
          label: z.string().min(1).max(64),
          value: z.number().finite(),
          color: z.string().regex(/^#[0-9a-f]{6}$/i),
        })
      )
      .max(20),
  })
  .strict();

export const mapCapabilitiesSchema = z
  .object({
    analysisId: analysisIdSchema,
    basemaps: z.array(mapBasemapSchema),
    layers: z.array(mapLayerSchema),
    terrain: z
      .object({
        available: z.boolean(),
        layerId: z.string().nullable(),
        unavailableReason: z.string().max(256).nullable(),
      })
      .strict(),
    bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.terrain.available && (!value.terrain.layerId || value.terrain.unavailableReason)) {
      context.addIssue({
        code: 'custom',
        path: ['terrain'],
        message: 'Available terrain requires a layer and no unavailable reason.',
      });
    }
    if (!value.terrain.available && (value.terrain.layerId || !value.terrain.unavailableReason)) {
      context.addIssue({
        code: 'custom',
        path: ['terrain'],
        message: 'Unavailable terrain requires a reason and no layer.',
      });
    }
  });

export const mapCapabilitiesResponseSchema = z.object({ capabilities: mapCapabilitiesSchema });

export type MapCapabilities = z.infer<typeof mapCapabilitiesSchema>;

export type MapCapabilitiesResponse = z.infer<typeof mapCapabilitiesResponseSchema>;

export const mapInspectionSchema = z
  .object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
    suitability: z.number().min(0).max(1).nullable(),
    thresholdClass: z.number().int().min(0).max(1).nullable(),
    predictors: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
    nearestOccurrenceMetres: z.number().nonnegative().nullable(),
  })
  .strict();

export const mapInspectionResponseSchema = z.object({ inspection: mapInspectionSchema });

export type MapInspection = z.infer<typeof mapInspectionSchema>;

export type MapInspectionResponse = z.infer<typeof mapInspectionResponseSchema>;

export const analysisVariableImportanceArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    variables: z.array(
      z
        .object({
          variable: z.string().min(1).max(64),
          importance: z.number().finite().nonnegative(),
          percent: z.number().finite().min(0).max(100),
        })
        .strict()
    ),
  })
  .strict();

export const analysisResponseCurvesArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    curves: z.array(
      z
        .object({
          variable: z.string().min(1).max(64),
          type: z.enum(['continuous', 'categorical']),
          values: z.array(z.number().finite()).min(1),
          suitability: z.array(z.number().finite().min(0).max(1)).min(1),
        })
        .strict()
        .refine((curve) => curve.values.length === curve.suitability.length)
    ),
  })
  .strict();

export const analysisExecutionSummaryArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    placeholder: z.literal(false),
    scientificModelExecuted: z.literal(true),
    completedAt: z.string().datetime(),
    configurationFingerprint: canonicalFingerprintSchema,
    inputFingerprint: canonicalFingerprintSchema,
    validation: rValidationSummarySchema,
    inputValidation: z
      .object({
        coordinatePolicy: z.enum(['reject-all', 'exclude-invalid']),
        coveragePolicy: z.enum(['require-all', 'exclude-uncovered']),
        minimumCoveragePercent: z.number().int().min(80).max(100),
      })
      .strict(),
    evaluationMethod: z.enum(['train-test-split', 'k-fold']),
    threshold: z.number().finite().min(0).max(1),
    runtime: z
      .object({
        R: z.string().min(1),
        maxnet: z.string().min(1),
        glmnet: z.string().min(1),
        terra: z.string().min(1),
        sf: z.string().min(1),
        GDAL: z.string().min(1),
        GEOS: z.string().min(1),
        PROJ: z.string().min(1),
      })
      .strict(),
    artifactSchemaVersion: z.literal(1),
  })
  .strict();

export const rGeneratedArtifactSchema = z
  .object({
    kind: scientificArtifactKindSchema,
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export type RGeneratedArtifact = z.infer<typeof rGeneratedArtifactSchema>;

export const rCogValidationSchema = z
  .object({
    cog: z.literal(true),
    overviewCount: z.number().int().positive(),
    compression: z.string().min(1),
    nodata: z.number().finite(),
    crs: z.string().min(1),
    bounds: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
    resolution: z.tuple([z.number().finite().positive(), z.number().finite().positive()]),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    dataType: z.string().min(1),
    finiteValueCount: z.number().int().positive(),
    minimum: z.number().finite(),
    maximum: z.number().finite(),
  })
  .strict();

export type RCogValidation = z.infer<typeof rCogValidationSchema>;

export const rDemValidationSchema = z
  .object({
    eligible: z.boolean(),
    reason: z.string().min(1).max(256).nullable(),
    sourceDataType: z.string().min(1),
    dataTypeValid: z.boolean(),
    unit: z.literal('metre').nullable(),
    crsTransformable: z.boolean(),
    resolutionValid: z.boolean(),
    finiteValuesValid: z.boolean(),
    rangeValid: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const checksPass =
      value.unit === 'metre' &&
      value.dataTypeValid &&
      value.crsTransformable &&
      value.resolutionValid &&
      value.finiteValuesValid &&
      value.rangeValid;
    if (value.eligible !== checksPass || (value.eligible ? value.reason !== null : !value.reason)) {
      context.addIssue({
        code: 'custom',
        message: 'DEM eligibility must match all authoritative raster checks.',
      });
    }
  });

export type RDemValidation = z.infer<typeof rDemValidationSchema>;

export const rGeneratedMapAssetSchema = z
  .object({
    datasetId: uploadDatasetIdSchema,
    filename: z.string().regex(/^[A-Za-z0-9._-]+\.tif$/i),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    raster: rCogValidationSchema,
    dem: rDemValidationSchema.nullable(),
  })
  .strict()
  .refine((value) => value.filename === `${value.datasetId}.tif`, {
    path: ['filename'],
    message: 'Map asset filenames must be derived from their dataset ID.',
  });

export type RGeneratedMapAsset = z.infer<typeof rGeneratedMapAssetSchema>;

export const rGeneratedArtifactSetSchema = z
  .array(rGeneratedArtifactSchema)
  .length(scientificArtifactKinds.length)
  .superRefine((value, context) => {
    if (
      new Set(value.map((artifact) => artifact.kind)).size !== scientificArtifactKinds.length ||
      !scientificArtifactKinds.every((kind) => value.some((artifact) => artifact.kind === kind))
    ) {
      context.addIssue({ code: 'custom', message: 'R runtime must produce every artifact once.' });
    }
  });

export const rValidationEventsPageSchema = z
  .object({
    mode: rJobModeSchema,
    generation: z.number().int().positive(),
    events: z.array(rValidationEventSchema).max(100),
    nextSequence: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    state: rValidationRunStateSchema,
    summary: rValidationSummarySchema.nullable(),
    artifacts: rGeneratedArtifactSetSchema.nullable(),
    mapAssets: z.array(rGeneratedMapAssetSchema).max(64).nullable().default(null),
    candidateCompletedAt: z.string().datetime().nullable(),
    failureCode: rValidationFailureCodeSchema.nullable(),
    result: z.union([analysisInputProfileSchema, analysisPreflightSchema]).nullable(),
  })
  .strict();

export type RValidationEventsPage = z.infer<typeof rValidationEventsPageSchema>;
