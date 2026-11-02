'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { analysisInputProfileResponseSchema } from '@ecosuitability/contracts';
import { Alert, Button, Card, Progress } from '@ecosuitability/ui';
import { LoaderCircle } from 'lucide-react';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { useAnalysis } from '../analysis/useAnalysis';
import { SetupShell } from './SetupShell';
import { ValidationProfileResults } from './ValidationProfileResults';

export const ValidationScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const queryClient = useQueryClient();
  const retryKey = useRef(`input-profile-retry-${crypto.randomUUID()}`);
  const analysis = useAnalysis(analysisId);
  const profile = useQuery({
    queryKey: analysisKeys.profile(analysisId),
    queryFn: async () => {
      const response = await api.request(`/v1/analyses/${analysisId}/input-profile`);
      if (response.status === 404 && analysis.data) {
        const body = { expectedInputRevision: analysis.data.analysis.inputRevision };
        const created = await api.request(`/v1/analyses/${analysisId}/input-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey('input-profile', analysisId, body),
          },
          body: JSON.stringify(body),
        });
        if (!created.ok) {
          throw new Error('Input profiling could not be queued.');
        }
        return analysisInputProfileResponseSchema.parse(await created.json());
      }
      if (!response.ok) {
        throw new Error('The input profile could not be loaded.');
      }
      return analysisInputProfileResponseSchema.parse(await response.json());
    },
    enabled: Boolean(analysis.data),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.profile.status ?? '') ? 1_500 : false,
  });
  const value = profile.data?.profile;
  const stale = Boolean(
    value && analysis.data && value.inputRevision !== analysis.data.analysis.inputRevision
  );

  const retry = async (): Promise<void> => {
    if (analysis.data && (value?.status === 'failed' || stale)) {
      const body = { expectedInputRevision: analysis.data.analysis.inputRevision };
      const response = await api.request(`/v1/analyses/${analysisId}/input-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': retryKey.current },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        retryKey.current = `input-profile-retry-${crypto.randomUUID()}`;
      }
    }
    await queryClient.invalidateQueries({ queryKey: analysisKeys.profile(analysisId) });
    await profile.refetch();
  };

  const profiling = value && ['queued', 'running'].includes(value.status);

  return (
    <SetupShell
      analysisId={analysisId}
      current="validation"
      title="Validate source data"
      description="Profiling inspects source structure, coordinate candidates, projection, grids, coverage, and a simplified spatial preview before model choices are applied."
    >
      {profile.isError ? (
        <QueryStateAlert
          error={profile.error}
          title="Input profile unavailable"
          onRetry={() => void retry()}
        />
      ) : null}
      {!value && !profile.isError ? (
        <ProfileProgress title="Preparing input profile" progress={0}>
          This bounded worker job may wait behind another analysis.
        </ProfileProgress>
      ) : null}
      {profiling ? (
        <ProfileProgress title="Profiling inputs" progress={value.progress}>
          Revision {value.inputRevision}
        </ProfileProgress>
      ) : null}
      {stale ? (
        <Alert className="mb-5" variant="warning">
          This profile belongs to an older input revision. Refresh profiling before continuing.
          <Button className="ml-3" size="sm" variant="secondary" onClick={() => void retry()}>
            Refresh profile
          </Button>
        </Alert>
      ) : null}
      {value && !profiling ? (
        <ValidationProfileResults profile={value} onRetry={() => void retry()} />
      ) : null}
      <div className="mt-8 flex justify-between">
        <Button asChild variant="secondary">
          <Link href={`/analyses/${analysisId}/setup/data`}>Edit data</Link>
        </Button>
        <Button asChild disabled={!value || stale || profiling || value.status === 'failed'}>
          <Link href={`/analyses/${analysisId}/setup/configuration`}>Configure analysis</Link>
        </Button>
      </div>
    </SetupShell>
  );
};

const ProfileProgress: React.FC<React.PropsWithChildren<{ title: string; progress: number }>> = ({
  title,
  progress,
  children,
}) => (
  <Card className="p-8">
    <div className="flex items-center gap-3">
      <LoaderCircle className="animate-spin text-primary" />
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
    <Progress className="mt-5" value={progress} />
  </Card>
);
