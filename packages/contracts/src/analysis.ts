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
