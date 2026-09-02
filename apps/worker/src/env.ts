import { z } from 'zod';

const schema = z.object({
  APP_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  REDIS_URL: z
    .url()
    .refine((value) => /^rediss?:/.test(value), 'Use a Redis URL.'),
  STORAGE_INTERNAL_ENDPOINT: z.url(),
  STORAGE_REGION: z.string().min(1).max(64),
  STORAGE_BUCKET: z.string().min(3).max(63),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(16),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true'),
  WORKER_OPERATIONS_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(9464),
  WORKER_METRICS_TOKEN: z.string().min(32),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(30000),
  ANALYSIS_EXECUTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(24 * 60 * 60 * 1000)
    .default(30 * 60 * 1000),
});

export type WorkerEnvironment = z.output<typeof schema>;

export const validateEnvironment = (
  config: Record<string, unknown>,
): WorkerEnvironment => schema.parse(config);
