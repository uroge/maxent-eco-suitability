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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  expiredAt: z.string().datetime().nullable(),
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

export const analysisArtifactIdSchema = z.string().regex(/^ar_[a-z0-9]{32}$/);

export type AnalysisArtifactId = z.infer<typeof analysisArtifactIdSchema>;

export const analysisArtifactKinds = [
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

export const analysisArtifactKindSchema = z.enum(analysisArtifactKinds);

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
];

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
  candidateCompletedAt: z.string().datetime().nullable(),
  failureCode: scientificValidationFailureCodeSchema.nullable(),
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
    schemaVersion: z.literal(1),
    method: z.enum(['train-test-split', 'k-fold']),
    folds: z.number().int().positive(),
    auc: z.number().finite().min(0).max(1),
    aucStandardDeviation: z.number().finite().nonnegative(),
    threshold: analysisThresholdMetricsSchema,
  })
  .strict();

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
    configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
    inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
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
    kind: analysisArtifactKindSchema,
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export type RGeneratedArtifact = z.infer<typeof rGeneratedArtifactSchema>;

export const rGeneratedArtifactSetSchema = z
  .array(rGeneratedArtifactSchema)
  .length(analysisArtifactKinds.length)
  .superRefine((value, context) => {
    if (!completeArtifactSet(value)) {
      context.addIssue({ code: 'custom', message: 'R runtime must produce every artifact once.' });
    }
  });

export const rValidationEventsPageSchema = z
  .object({
    generation: z.number().int().positive(),
    events: z.array(rValidationEventSchema).max(100),
    nextSequence: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    state: rValidationRunStateSchema,
    summary: rValidationSummarySchema.nullable(),
    artifacts: rGeneratedArtifactSetSchema.nullable(),
    candidateCompletedAt: z.string().datetime().nullable(),
    failureCode: rValidationFailureCodeSchema.nullable(),
  })
  .strict();

export type RValidationEventsPage = z.infer<typeof rValidationEventsPageSchema>;
