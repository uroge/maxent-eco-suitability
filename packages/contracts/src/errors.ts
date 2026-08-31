import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'CONFLICT',
  'NOT_FOUND',
  'AUTHENTICATION_REQUIRED',
  'ACCESS_DENIED',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const validationDetailSchema = z.object({
  field: z.string().min(1),
  code: z.string().min(1),
});

export type ValidationDetail = z.infer<typeof validationDetailSchema>;

export const errorDetailsSchema = z
  .object({
    fields: z.array(validationDetailSchema).max(32),
  })
  .nullable();

export type ErrorDetails = z.infer<typeof errorDetailsSchema>;

export const apiErrorSchema = z.object({
  version: z.literal('1'),
  code: errorCodeSchema,
  message: z.string().min(1),
  requestId: z.string().min(1).max(64),
  details: errorDetailsSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const errorEnvelopeSchema = z.object({
  error: apiErrorSchema,
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
