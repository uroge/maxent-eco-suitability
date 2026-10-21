'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  analysisConfigurationResponseSchema,
  analysisInputProfileResponseSchema,
  analysisPreflightResponseSchema,
} from '@ecosuitability/contracts';
import { Alert, Badge, Button, Card, Progress } from '@ecosuitability/ui';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { SetupShell } from './SetupShell';

export const ReviewScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const profile = useQuery({
    queryKey: analysisKeys.profile(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/input-profile`, analysisInputProfileResponseSchema),
  });
  const configuration = useQuery({
    queryKey: analysisKeys.configuration(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/configuration`, analysisConfigurationResponseSchema),
  });
  const preflight = useQuery({
    queryKey: analysisKeys.preflight(analysisId),
    queryFn: async () => {
      const response = await api.request(`/v1/analyses/${analysisId}/preflight`);
      if (response.status === 404 && profile.data && configuration.data?.fingerprint) {
        const body = {
          expectedInputRevision: profile.data.profile.inputRevision,
          expectedConfigurationRevision: configuration.data.revision,
          configurationFingerprint: configuration.data.fingerprint,
        };
        const queued = await api.request(`/v1/analyses/${analysisId}/preflight`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey('preflight', analysisId, body),
          },
          body: JSON.stringify(body),
        });
        if (!queued.ok) throw new Error('REQUEST_FAILED');
        return analysisPreflightResponseSchema.parse(await queued.json());
      }
      if (!response.ok) throw new Error('REQUEST_FAILED');
      return analysisPreflightResponseSchema.parse(await response.json());
    },
    enabled: Boolean(profile.data && configuration.data?.fingerprint),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.preflight.status ?? '') ? 1_500 : false,
  });
  const value = preflight.data?.preflight;
  const queue = async (): Promise<void> => {
    if (!value || value.status !== 'passed') return;
    const body = {
      expectedInputRevision: value.inputRevision,
      expectedConfigurationRevision: value.configurationRevision,
      configurationFingerprint: value.configurationFingerprint,
    };
    const response = await api.request(`/v1/analyses/${analysisId}/queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey('queue', analysisId, body),
      },
      body: JSON.stringify(body),
    });
    if (response.ok) router.push(`/analyses/${analysisId}/run`);
  };
  return (
    <SetupShell
      analysisId={analysisId}
      current="review"
      title="Review and queue"
      description="Preflight applies the final scientific policies to the exact input and configuration revisions. Queueing freezes that validated snapshot."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex justify-between">
            <h2 className="font-semibold">Input profile</h2>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/analyses/${analysisId}/setup/validation`}>Edit</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Revision {profile.data?.profile.inputRevision ?? '—'} ·{' '}
            {profile.data?.profile.checks.length ?? 0} checks
          </p>
        </Card>
        <Card className="p-6">
          <div className="flex justify-between">
            <h2 className="font-semibold">Configuration</h2>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/analyses/${analysisId}/setup/configuration`}>Edit</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {configuration.data?.configuration?.speciesName ?? 'Loading'} · Revision{' '}
            {configuration.data?.revision ?? '—'}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground break-all">
            {configuration.data?.fingerprint}
          </p>
        </Card>
      </div>
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Authoritative preflight</h2>
          {value ? (
            <Badge
              variant={
                value.status === 'passed'
                  ? 'success'
                  : value.status === 'blocked'
                    ? 'error'
                    : 'warning'
              }
            >
              {value.status}
            </Badge>
          ) : null}
        </div>
        {!value || ['queued', 'running'].includes(value.status) ? (
          <div className="mt-5">
            <p className="mb-2 text-sm text-muted-foreground">Checking current revisions…</p>
            <Progress value={value?.progress ?? 0} />
          </div>
        ) : null}
        {value?.warnings.map((warning) => (
          <Alert className="mt-4" variant="warning" key={warning}>
            {warning}
          </Alert>
        ))}
        {value?.blockers.map((blocker) => (
          <Alert className="mt-4" variant="destructive" key={blocker}>
            {blocker}
          </Alert>
        ))}
      </Card>
      <Alert className="mt-6" variant="information">
        Queueing freezes input revision {value?.inputRevision ?? '—'} and configuration revision{' '}
        {value?.configurationRevision ?? '—'}. Execution repeats scientific validation defensively
        before training.
      </Alert>
      <div className="mt-8 flex justify-between">
        <Button asChild variant="secondary">
          <Link href={`/analyses/${analysisId}/setup/configuration`}>Back</Link>
        </Button>
        <Button disabled={value?.status !== 'passed'} onClick={queue}>
          Queue analysis
        </Button>
      </div>
    </SetupShell>
  );
};
