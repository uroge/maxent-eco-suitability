import { auth } from '@clerk/nextjs/server';
import type { ZodType } from 'zod';
import { responseError } from './api-error';

export const serverApi = async <T>(
  path: string,
  schema: ZodType<T>,
  options: RequestInit = {}
): Promise<T> => {
  const session = await auth();
  const token = await session.getToken();
  const response = await fetch(new URL(path, process.env.NEXT_PUBLIC_API_URL), {
    ...options,
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw await responseError(response);
  }
  return schema.parse(await response.json());
};
