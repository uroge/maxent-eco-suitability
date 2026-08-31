import { z } from 'zod';

export const roleSchema = z.enum(['user', 'admin']);

export type Role = z.infer<typeof roleSchema>;

export const principalSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
  role: roleSchema,
});

export type Principal = z.infer<typeof principalSchema>;
