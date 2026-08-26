import { z } from 'zod';

const schema = z.object({ REDIS_URL: z.string().url() });

export function validateEnvironment(config: Record<string, unknown>) {
  return schema.parse(config);
}
