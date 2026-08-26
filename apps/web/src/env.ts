import { z } from 'zod';

const clientEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});

// Only NEXT_PUBLIC_* values may be exposed to browser code.
export const clientEnvironment = clientEnvironmentSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
