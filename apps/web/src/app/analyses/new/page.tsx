import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { analysisResponseSchema } from '@ecosuitability/contracts';
import { serverApi } from '@/lib/server-api';

export default async function NewAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string }>;
}) {
  const { example } = await searchParams;
  const result = await serverApi('/v1/analyses', analysisResponseSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `draft-${randomUUID()}`,
    },
    body: JSON.stringify({}),
  });
  redirect(`/analyses/${result.analysis.id}/setup/data${example === '1' ? '?example=1' : ''}`);
}
