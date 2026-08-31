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
    REDIS_URL: z
      .url()
      .refine((value) => /^rediss?:/.test(value), 'Use a Redis URL.'),
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
  })
  .superRefine((environment, context) => {
    if (environment.APP_ENV !== 'production') {
      return;
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
  });

export type ApiEnvironment = z.output<typeof schema>;

export const validateEnvironment = (
  config: Record<string, unknown>,
): ApiEnvironment => schema.parse(config);
