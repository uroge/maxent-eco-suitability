'use client';

import { Alert, Button } from '@ecosuitability/ui';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { AttachedDatasetsPanel } from './AttachedDatasetsPanel';
import { DatasetSelectionPanels } from './DatasetSelectionPanels';
import { ExampleDatasetFlow } from './ExampleDatasetFlow';
import { IncompleteUploadsPanel } from './IncompleteUploadsPanel';
import { SetupShell } from './SetupShell';
import { UploadTasksPanel } from './UploadTasksPanel';
import { useDataUploads } from './useDataUploads';

export const DataScreen: React.FC<{ analysisId: string; example?: boolean }> = ({
  analysisId,
  example = false,
}) => {
  const uploads = useDataUploads(analysisId);
  const { actions, derived, queries, state } = uploads;

  if (queries.inputs.isError || queries.activeUploads.isError) {
    return (
      <SetupShell
        analysisId={analysisId}
        current="data"
        title="Add analysis data"
        description="Upload occurrence records and environmental predictors."
      >
        <QueryStateAlert
          error={queries.inputs.error ?? queries.activeUploads.error}
          title="Upload state unavailable"
          onRetry={() => {
            void queries.inputs.refetch();
            void queries.activeUploads.refetch();
          }}
        />
      </SetupShell>
    );
  }

  return (
    <SetupShell
      analysisId={analysisId}
      current="data"
      title="Add analysis data"
      description="Files upload directly to temporary object storage and remain available for 48 hours. Replacement keeps the current dataset active until its new files are verified."
    >
      {example ? (
        <>
          <ExampleDatasetFlow
            message={state.message}
            phase={state.phase}
            progress={derived.progress}
            onStart={actions.startExample}
          />
          <UploadTasksPanel tasks={state.tasks} onPause={actions.pause} onRetry={actions.retry} />
        </>
      ) : null}
      {!example ? (
        <>
          {state.message ? (
            <Alert className="mb-5" variant="warning">
              {state.message}
            </Alert>
          ) : null}
          <IncompleteUploadsPanel
            uploads={queries.activeUploads.data?.uploads ?? []}
            onResume={(upload, files) => void actions.resumeServerUpload(upload, files)}
            onDiscard={(datasetId) => void actions.discardUpload(datasetId)}
          />
          <AttachedDatasetsPanel
            manifest={queries.inputs.data?.inputs}
            onReplace={(datasetId, kind, format, files) =>
              void actions.replace(datasetId, kind, format, files)
            }
            onRemove={(datasetId) => void actions.remove(datasetId)}
          />
          <DatasetSelectionPanels
            hasOccurrence={derived.hasOccurrence}
            format={state.format}
            occurrenceFiles={state.occurrenceFiles}
            predictorFiles={state.predictorFiles}
            onFormatChange={actions.setFormat}
            onOccurrenceFilesChange={actions.setOccurrenceFiles}
            onPredictorFilesChange={actions.setPredictorFiles}
          />
          <UploadTasksPanel tasks={state.tasks} onPause={actions.pause} onRetry={actions.retry} />
          <div className="mt-8 flex justify-end">
            <div className="max-w-md text-right">
              <p className="mb-2 text-xs text-muted-foreground">
                Completing this step starts profiling and opens Validation, where progress and
                detected metadata are shown.
              </p>
              <Button
                loading={derived.starting || derived.finishing}
                disabled={derived.hasUnresolvedTasks}
                onClick={() => void actions.startSelected()}
              >
                {derived.hasUnresolvedTasks
                  ? 'Resolve uploads above'
                  : derived.starting
                    ? 'Uploading files…'
                    : derived.finishing
                      ? 'Starting profile…'
                      : state.occurrenceFiles.length || state.predictorFiles.length
                        ? 'Upload and continue to Validation'
                        : 'Continue to Validation'}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </SetupShell>
  );
};
