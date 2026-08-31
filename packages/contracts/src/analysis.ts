import { z } from 'zod';

export const analysisIdSchema = z.string().regex(/^an_[a-z0-9]{32}$/);

export type AnalysisId = z.infer<typeof analysisIdSchema>;

export const analysisStatusSchema = z.enum([
  'draft',
  'uploading',
  'queued',
  'running',
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

export const analysisSchema = z.object({
  id: analysisIdSchema,
  status: analysisStatusSchema,
  displayName: z.string().min(1).max(120).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  expiredAt: z.string().datetime().nullable(),
  failure: analysisFailureSchema.nullable(),
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
    files: z.array(uploadFileSchema).min(1).max(5),
  })
  .strict();

export type CreateUploadDatasetRequest = z.infer<typeof createUploadDatasetRequestSchema>;

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
