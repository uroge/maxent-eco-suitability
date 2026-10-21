import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { analysisResponseSchema } from '@ecosuitability/contracts';
import { serverApi } from '@/lib/server-api';

export default async function NewAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ example?: string; intent?: string }>;
}) {
  const { example, intent } = await searchParams;
  if (!intent) {
    redirect(`/analyses/new?intent=${randomUUID()}${example === '1' ? '&example=1' : ''}`);
  }
  const result = await serverApi('/v1/analyses', analysisResponseSchema, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `draft-${intent}`,
    },
    body: JSON.stringify({}),
  });
  redirect(`/analyses/${result.analysis.id}/setup/data${example === '1' ? '?example=1' : ''}`);
}
