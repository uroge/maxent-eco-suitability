'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Progress,
} from '@ecosuitability/ui';
import { Clock3 } from 'lucide-react';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { useAnalysis } from '../analysis/useAnalysis';
import { idempotencyKey, useAnalysisApi } from '../analysis/api';

const active = new Set(['queued', 'running', 'cancelling']);

export const RunScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const analysis = useAnalysis(analysisId, true);
  const [now, setNow] = useState(Date.now);
  const [cancelError, setCancelError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const status = analysis.data?.analysis.status;
  useEffect(() => {
    if (!status || !active.has(status)) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [status]);
  useEffect(() => {
    if (status === 'succeeded') {
      router.replace(`/analyses/${analysisId}`);
    }
  }, [analysisId, router, status]);
  const value = analysis.data?.analysis;
  const start = value?.startedAt ?? value?.queuedAt;
  const elapsed = start ? Math.max(0, Math.floor((now - new Date(start).getTime()) / 1000)) : 0;
  const cancel = async (): Promise<void> => {
    if (!value) {
      return;
    }
    setCancelling(true);
    setCancelError(undefined);
    try {
      const body = { expectedStatus: value.status };
      const response = await api.request(`/v1/analyses/${analysisId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('cancel', analysisId, body),
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error('Cancellation could not be requested. The run is still being monitored.');
      }
      await analysis.refetch();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Cancellation failed.');
    } finally {
      setCancelling(false);
    }
  };
  const guidanceTarget =
    value?.failure?.code.startsWith('OCCURRENCE') || value?.failure?.code.startsWith('PREDICTOR')
      ? 'data'
      : 'configuration';
  const statusTitle =
    value?.status === 'queued'
      ? 'Waiting for the analysis worker'
      : value?.status === 'cancelling'
        ? 'Cancellation requested'
        : value?.progress?.stage === 'retrying'
          ? 'Recovering and retrying'
          : value?.status === 'running'
            ? 'Scientific analysis in progress'
            : value?.status === 'succeeded'
              ? 'Analysis complete'
              : value?.status === 'failed'
                ? 'Analysis failed'
                : value?.status === 'cancelled'
                  ? 'Analysis cancelled'
                  : 'Loading analysis state';
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <p className="font-mono text-xs text-muted-foreground">{analysisId}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Analysis execution</h1>
      {analysis.isError ? (
        <div className="mt-8">
          <QueryStateAlert
            title="Execution state unavailable"
            message="The run may still be active. Retry to resume monitoring."
            onRetry={() => void analysis.refetch()}
          />
        </div>
      ) : null}
      <Card className="mt-8 p-7" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {value?.status ?? 'Loading'}
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {value?.progress?.message ?? statusTitle}
            </h2>
          </div>
          <span className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <Clock3 size={16} />
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
        </div>
        <Progress className="mt-6" value={value?.progress?.percent ?? 0} />
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          <span>{value?.progress?.stage ?? 'queued'}</span>
          <span>Attempt {value?.progress?.attempt ?? '—'}</span>
        </div>
      </Card>
      {cancelError ? (
        <Alert className="mt-6" variant="destructive">
          {cancelError}
        </Alert>
      ) : null}
      {value?.status === 'failed' ? (
        <Alert className="mt-6" variant="destructive">
          <strong>{statusTitle}.</strong>{' '}
          {value.failure?.message ??
            'Review the input and configuration guidance before starting a new draft.'}{' '}
          This frozen run cannot be edited. In a new draft, revisit the{' '}
          {guidanceTarget === 'data' ? 'uploaded files and source mapping' : 'model configuration'}{' '}
          before queueing again.
        </Alert>
      ) : null}
      {value?.status === 'cancelled' ? (
        <Alert className="mt-6" variant="warning">
          The analysis was cancelled and is immutable. Temporary files will be removed by lifecycle
          cleanup; recovery requires a new draft and re-upload.
        </Alert>
      ) : null}
      <div className="mt-8 flex justify-end gap-3">
        {value && active.has(value.status) ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Cancel analysis</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="text-lg font-semibold">Cancel this analysis?</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                Cancellation is final and schedules temporary inputs and outputs for cleanup.
              </DialogDescription>
              <div className="mt-6 flex justify-end gap-3">
                <DialogClose asChild>
                  <Button variant="secondary">Keep running</Button>
                </DialogClose>
                <Button loading={cancelling} variant="destructive" onClick={cancel}>
                  Confirm cancellation
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <Button asChild>
            <Link href="/analyses/new">Start a new analysis</Link>
          </Button>
        )}
      </div>
    </main>
  );
};
