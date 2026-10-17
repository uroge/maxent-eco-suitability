'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Progress } from '@ecosuitability/ui';
import { uploadDataset } from '@/lib/direct-upload';
import { useAnalysisApi } from '../analysis/api';

export const ExampleDatasetFlow: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const started = useRef(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const [occurrenceResponse, predictorResponse] = await Promise.all([
          fetch('/example/synthetic-occurrences.csv', { signal: controller.signal }),
          fetch('/example/synthetic-elevation.tif', { signal: controller.signal }),
        ]);
        if (!occurrenceResponse.ok || !predictorResponse.ok)
          throw new Error('Example assets are unavailable.');
        const occurrence = new File(
          [await occurrenceResponse.blob()],
          'synthetic-occurrences.csv',
          { type: 'text/csv' }
        );
        const predictor = new File([await predictorResponse.blob()], 'synthetic-elevation.tif', {
          type: 'image/tiff',
        });
        await uploadDataset(api, analysisId, 'occurrence', 'csv', [{ file: occurrence }], {
          idempotencyKey: `example-occurrence-${analysisId}`,
          signal: controller.signal,
          onProgress: () => setProgress(35),
        });
        await uploadDataset(api, analysisId, 'predictor', 'geotiff', [{ file: predictor }], {
          idempotencyKey: `example-predictor-${analysisId}`,
          signal: controller.signal,
          onProgress: () => setProgress(75),
        });
        const completed = await api.request(`/v1/analyses/${analysisId}/inputs/complete`, {
          method: 'POST',
        });
        if (!completed.ok) throw new Error('The example inputs could not be completed.');
        setProgress(90);
        const profile = await api.request(`/v1/analyses/${analysisId}/input-profile`, {
          method: 'POST',
        });
        if (!profile.ok) throw new Error('The example profile could not be queued.');
        setProgress(100);
        router.replace(`/analyses/${analysisId}/setup/validation`);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Example setup failed.');
      }
    })();
  }, [analysisId, api, router]);
  return (
    <Card className="p-8">
      <h2 className="text-lg font-semibold">Preparing the synthetic example</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The checked-in fixture is converted to browser File objects and follows the normal hashing,
        direct-upload, completion, and profiling flow. It never injects result data.
      </p>
      <Progress className="mt-6" value={progress} />
      {error ? (
        <Alert className="mt-5" variant="destructive">
          {error}
        </Alert>
      ) : null}
    </Card>
  );
};
