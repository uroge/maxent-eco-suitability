'use client';

import { useAuth } from '@clerk/nextjs';
import { useMemo } from 'react';
import type { ZodType } from 'zod';
import { createApiClient } from '@/lib/api-client';

export const analysisKeys = {
  analysis: (id: string) => ['analysis', id] as const,
  inputs: (id: string) => ['analysis', id, 'inputs'] as const,
  profile: (id: string) => ['analysis', id, 'profile'] as const,
  configuration: (id: string) => ['analysis', id, 'configuration'] as const,
  preflight: (id: string) => ['analysis', id, 'preflight'] as const,
  results: (id: string) => ['analysis', id, 'results'] as const,
  overview: (id: string) => ['analysis', id, 'overview'] as const,
  diagnostics: (id: string) => ['analysis', id, 'diagnostics'] as const,
  map: (id: string) => ['analysis', id, 'map'] as const,
};

export const useAnalysisApi = () => {
  const { getToken } = useAuth();
  return useMemo(() => {
    const client = createApiClient(getToken);
    return {
      request: client.request,
      json: async <T>(path: string, schema: ZodType<T>, options: RequestInit = {}): Promise<T> => {
        const response = await client.request(path, options);
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED');
        }
        return schema.parse(await response.json());
      },
    };
  }, [getToken]);
};

export const idempotencyKey = (
  operation: string,
  analysisId: string,
  intent: unknown = null
): string => {
  const intentKey = JSON.stringify(intent);
  const storageKey = `ecosuitability:idempotency:${operation}:${analysisId}:${intentKey}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }
  const created = `${operation}-${crypto.randomUUID()}`;
  window.sessionStorage.setItem(storageKey, created);
  return created;
};
