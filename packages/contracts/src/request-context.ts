import { z } from 'zod';

export const requestContextSchema = z.object({
  requestId: z.string().min(1).max(64),
  route: z.string().min(1),
  method: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export type RequestContext = z.infer<typeof requestContextSchema>;
