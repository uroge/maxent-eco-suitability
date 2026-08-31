import { z } from 'zod';

export const healthStatusSchema = z.enum(['ok', 'degraded']);

export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.string().min(1),
  requestId: z.string().min(1).max(64),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
