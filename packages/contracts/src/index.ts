import { z } from 'zod';

export * from './auth';
export * from './errors';
export * from './health';
export * from './request-context';

export const analysisStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
export const applicationErrorSchema = z.object({ code: z.string(), message: z.string() });
export type ApplicationError = z.infer<typeof applicationErrorSchema>;
