import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  REDIS_URL: z.string().url(),
});

export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}
