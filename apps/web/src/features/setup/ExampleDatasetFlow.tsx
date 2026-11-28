'use client';

import { useEffect } from 'react';
import { Alert, Card, Progress } from '@ecosuitability/ui';
import type { UploadWorkflowPhase } from './upload-workflow-machine';

type ExampleDatasetFlowProps = {
  message?: string;
  onStart: () => Promise<void>;
  phase: UploadWorkflowPhase;
  progress: number;
};

const stageLabel = (phase: UploadWorkflowPhase): string => {
  switch (phase) {
    case 'loading-example':
      return 'Loading example files…';
    case 'uploading':
      return 'Uploading example datasets…';
    case 'completing':
      return 'Completing inputs…';
    case 'profiling':
      return 'Starting spatial profiling…';
    case 'redirecting':
      return 'Opening Validation…';
    case 'failed':
      return 'Example setup stopped';
    case 'idle':
      return 'Preparing example…';
  }
};

export const ExampleDatasetFlow: React.FC<ExampleDatasetFlowProps> = ({
  message,
  onStart,
  phase,
  progress,
}) => {
  useEffect(() => {
    void onStart();
  }, [onStart]);

  return (
    <Card className="p-8">
      <h2 className="text-lg font-semibold">Preparing the synthetic example</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The checked-in fixture is converted to browser File objects and follows the normal hashing,
        direct-upload, completion, and profiling flow. It never injects result data.
      </p>
      <p className="mt-5 text-sm font-medium">{stageLabel(phase)}</p>
      <Progress className="mt-2" value={progress} />
      {phase === 'failed' && message ? (
        <Alert className="mt-5" variant="destructive">
          {message}
        </Alert>
      ) : null}
    </Card>
  );
};
