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

export const uploadDatasetFormatSchema = z.enum(['csv', 'xlsx', 'geojson', 'shapefile', 'geotiff']);

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

export const analysisArtifactKindSchema = z.enum(['execution-summary', 'run-log']);

export type AnalysisArtifactKind = z.infer<typeof analysisArtifactKindSchema>;

export const workerSha256VerificationSchema = z.literal('worker-generated');

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

export const analysisResultManifestSchema = z.object({
  analysisId: analysisIdSchema,
  completedAt: z.string().datetime(),
  resultExpiresAt: z.string().datetime(),
  artifacts: z.array(analysisArtifactSchema).length(2),
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
