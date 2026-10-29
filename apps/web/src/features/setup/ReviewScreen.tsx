'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analysisConfigurationResponseSchema,
  analysisInputManifestResponseSchema,
  analysisInputProfileResponseSchema,
  analysisPreflightResponseSchema,
} from '@ecosuitability/contracts';
import { Alert, Button } from '@ecosuitability/ui';
import { ApiClientError } from '@/lib/api-error';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { useAnalysis } from '../analysis/useAnalysis';
import { SetupShell } from './SetupShell';
import { PreflightPanel, ReviewSummaryPanels } from './ReviewPanels';

export const ReviewScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const analysis = useAnalysis(analysisId);
  const [queueError, setQueueError] = useState<string>();
  const [queueing, setQueueing] = useState(false);
  const preflightRetryKey = useRef(`preflight-retry-${crypto.randomUUID()}`);
  const inputs = useQuery({
    queryKey: analysisKeys.inputs(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/inputs`, analysisInputManifestResponseSchema),
  });
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
  const currentInputRevision = analysis.data?.analysis.inputRevision;

  const createPreflight = async (retry = false) => {
    if (!configuration.data?.fingerprint || currentInputRevision === undefined) {
      throw new Error('The current configuration is incomplete.');
    }
    const body = {
      expectedInputRevision: currentInputRevision,
      expectedConfigurationRevision: configuration.data.revision,
      configurationFingerprint: configuration.data.fingerprint,
    };
    const response = await api.request(`/v1/analyses/${analysisId}/preflight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': retry
          ? preflightRetryKey.current
          : idempotencyKey('preflight', analysisId, body),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error('Authoritative preflight could not be queued.');
    }
    const parsed = analysisPreflightResponseSchema.parse(await response.json());
    if (retry) {
      preflightRetryKey.current = `preflight-retry-${crypto.randomUUID()}`;
    }
    return parsed;
  };

  const preflight = useQuery({
    queryKey: analysisKeys.preflight(analysisId),
    queryFn: async () => {
      const response = await api.request(`/v1/analyses/${analysisId}/preflight`);
      if (response.status === 404) {
        return createPreflight();
      }
      if (!response.ok) {
        throw new ApiClientError(
          response.status,
          'INVALID_RESPONSE',
          'Preflight could not be loaded.'
        );
      }
      const loaded = analysisPreflightResponseSchema.parse(await response.json());
      const stale =
        loaded.preflight.inputRevision !== currentInputRevision ||
        loaded.preflight.configurationRevision !== configuration.data?.revision ||
        loaded.preflight.configurationFingerprint !== configuration.data?.fingerprint;
      return stale ? createPreflight() : loaded;
    },
    enabled: Boolean(configuration.data?.fingerprint && currentInputRevision !== undefined),
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.preflight.status ?? '') ? 1_500 : false,
  });
  const value = preflight.data?.preflight;
  const stale = Boolean(
    value &&
    (value.inputRevision !== currentInputRevision ||
      value.configurationRevision !== configuration.data?.revision ||
      value.configurationFingerprint !== configuration.data?.fingerprint)
  );

  const queue = async (): Promise<void> => {
    if (!value || value.status !== 'passed' || stale) {
      return;
    }
    setQueueing(true);
    setQueueError(undefined);
    const body = {
      expectedInputRevision: value.inputRevision,
      expectedConfigurationRevision: value.configurationRevision,
      configurationFingerprint: value.configurationFingerprint,
    };
    try {
      const response = await api.request(`/v1/analyses/${analysisId}/queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('queue', analysisId, body),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? 'Inputs or configuration changed. Run preflight again before queueing.'
            : 'The analysis could not be queued. Retry without changing the validated snapshot.'
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      router.push(`/analyses/${analysisId}/run`);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'The analysis could not be queued.');
      setQueueing(false);
    }
  };

  const dependencyError =
    analysis.isError ||
    inputs.isError ||
    profile.isError ||
    configuration.isError ||
    preflight.isError;

  return (
    <SetupShell
      analysisId={analysisId}
      current="review"
      title="Review and queue"
      description="Preflight applies the final scientific policies to the exact input and configuration revisions. Queueing freezes that validated snapshot."
    >
      {dependencyError ? (
        <QueryStateAlert
          error={
            analysis.error ??
            inputs.error ??
            profile.error ??
            configuration.error ??
            preflight.error
          }
          title="Review data unavailable"
          onRetry={() => {
            void analysis.refetch();
            void inputs.refetch();
            void profile.refetch();
            void configuration.refetch();
            void preflight.refetch();
          }}
        />
      ) : null}
      {queueError ? (
        <Alert className="mb-6" variant="destructive">
          {queueError}{' '}
          <Link className="underline" href={`/analyses/${analysisId}/setup/configuration`}>
            Edit configuration
          </Link>
        </Alert>
      ) : null}
      <ReviewSummaryPanels
        analysisId={analysisId}
        inputRevision={currentInputRevision}
        inputs={inputs.data}
        profile={profile.data}
        configuration={configuration.data}
      />
      <PreflightPanel
        analysisId={analysisId}
        preflight={value}
        stale={stale}
        onRetry={() => void createPreflight(true).then(() => preflight.refetch())}
      />
      <Alert className="mt-6" variant="information">
        Queueing freezes input revision {value?.inputRevision ?? '—'} and configuration revision{' '}
        {value?.configurationRevision ?? '—'}. Execution repeats scientific validation before
        training.
      </Alert>
      <div className="mt-8 flex justify-between gap-3">
        <Button asChild variant="secondary">
          <Link href={`/analyses/${analysisId}/setup/configuration`}>Back</Link>
        </Button>
        <Button
          loading={queueing}
          disabled={value?.status !== 'passed' || stale}
          onClick={() => void queue()}
        >
          {queueing ? 'Opening execution…' : 'Queue analysis'}
        </Button>
      </div>
    </SetupShell>
  );
};
