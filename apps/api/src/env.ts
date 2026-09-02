import { z } from 'zod';

const environmentSchema = z.enum([
  'development',
  'test',
  'staging',
  'production',
]);

const commaSeparatedValues = z.string().transform((value, context) => {
  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'At least one value is required.',
    });
    return z.NEVER;
  }

  return values;
});

const schema = z
  .object({
    APP_ENV: environmentSchema.default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    MAX_JSON_BODY_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(1048576)
      .default(1048576),
    HTTP_HEADERS_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(15000),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(30000),
    HTTP_KEEP_ALIVE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120000)
      .default(5000),
    REDIS_URL: z
      .url()
      .refine((value) => /^rediss?:/.test(value), 'Use a Redis URL.'),
    REDIS_DURABILITY_MODE: z
      .enum(['disabled', 'required', 'managed'])
      .default('disabled'),
    STORAGE_PROVIDER: z.enum(['seaweedfs', 'r2']),
    STORAGE_INTERNAL_ENDPOINT: z.url(),
    STORAGE_PRESIGN_ENDPOINT: z.url(),
    STORAGE_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    STORAGE_REGION: z.string().min(1).max(64),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(16),
    STORAGE_CORS_ORIGINS: commaSeparatedValues,
    STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true'),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_AUTHORIZED_PARTIES: commaSeparatedValues,
    API_CORS_ORIGINS: commaSeparatedValues,
    TRUST_PROXY_CIDRS: commaSeparatedValues,
    METRICS_TOKEN: z.string().min(32),
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
  })
  .superRefine((environment, context) => {
    if (environment.APP_ENV !== 'production') {
      return;
    }

    if (environment.REDIS_DURABILITY_MODE === 'disabled') {
      context.addIssue({
        code: 'custom',
        path: ['REDIS_DURABILITY_MODE'],
        message: 'Production requires durable Redis lifecycle storage.',
      });
    }

    if (environment.STORAGE_PROVIDER !== 'r2') {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_PROVIDER'],
        message: 'Production requires R2.',
      });
    }

    if (
      !environment.STORAGE_INTERNAL_ENDPOINT.startsWith('https://') ||
      !environment.STORAGE_PRESIGN_ENDPOINT.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_INTERNAL_ENDPOINT'],
        message: 'Production storage endpoints must use HTTPS.',
      });
    }

    for (const origin of environment.API_CORS_ORIGINS) {
      if (!origin.startsWith('https://')) {
        context.addIssue({
          code: 'custom',
          path: ['API_CORS_ORIGINS'],
          message: 'Production origins must use HTTPS.',
        });
      }
    }

    for (const party of environment.CLERK_AUTHORIZED_PARTIES) {
      if (!party.startsWith('https://')) {
        context.addIssue({
          code: 'custom',
          path: ['CLERK_AUTHORIZED_PARTIES'],
          message: 'Production authorized parties must use HTTPS.',
        });
      }
    }

    for (const cidr of environment.TRUST_PROXY_CIDRS) {
      if (cidr === '0.0.0.0/0' || cidr === '::/0') {
        context.addIssue({
          code: 'custom',
          path: ['TRUST_PROXY_CIDRS'],
          message: 'Production proxy CIDRs must not trust all addresses.',
        });
      }
    }
  });

export type ApiEnvironment = z.output<typeof schema>;

export const validateEnvironment = (
  config: Record<string, unknown>,
): ApiEnvironment => schema.parse(config);
