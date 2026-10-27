'use client';

import { Alert, Button } from '@ecosuitability/ui';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { SetupShell } from './SetupShell';
import { ExampleDatasetFlow } from './ExampleDatasetFlow';
import {
  AttachedDatasetsPanel,
  DatasetSelectionPanels,
  IncompleteUploadsPanel,
  UploadTasksPanel,
} from './DataUploadPanels';
import { useDataUploads } from './useDataUploads';

export const DataScreen: React.FC<{ analysisId: string; example?: boolean }> = ({
  analysisId,
  example = false,
}) => {
  const uploads = useDataUploads(analysisId);

  if (uploads.inputs.isError || uploads.activeUploads.isError) {
    return (
      <SetupShell
        analysisId={analysisId}
        current="data"
        title="Add analysis data"
        description="Upload occurrence records and environmental predictors."
      >
        <QueryStateAlert
          error={uploads.inputs.error ?? uploads.activeUploads.error}
          title="Upload state unavailable"
          onRetry={() => {
            void uploads.inputs.refetch();
            void uploads.activeUploads.refetch();
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
      {example ? <ExampleDatasetFlow analysisId={analysisId} /> : null}
      {!example ? (
        <>
          {uploads.message ? (
            <Alert className="mb-5" variant="warning">
              {uploads.message}
            </Alert>
          ) : null}
          <IncompleteUploadsPanel
            uploads={uploads.activeUploads.data?.uploads ?? []}
            onResume={(upload, files) => void uploads.resumeServerUpload(upload, files)}
            onDiscard={(datasetId) => void uploads.discardUpload(datasetId)}
          />
          <AttachedDatasetsPanel
            manifest={uploads.inputs.data?.inputs}
            onReplace={(datasetId, kind, format, files) =>
              void uploads.replace(datasetId, kind, format, files)
            }
            onRemove={(datasetId) => void uploads.remove(datasetId)}
          />
          <DatasetSelectionPanels
            hasOccurrence={uploads.hasOccurrence}
            format={uploads.format}
            occurrenceFiles={uploads.occurrenceFiles}
            predictorFiles={uploads.predictorFiles}
            onFormatChange={uploads.setFormat}
            onOccurrenceFilesChange={uploads.setOccurrenceFiles}
            onPredictorFilesChange={uploads.setPredictorFiles}
          />
          <UploadTasksPanel
            tasks={uploads.tasks}
            onPause={uploads.pause}
            onRetry={(task) => void uploads.retry(task)}
          />
          <div className="mt-8 flex justify-end">
            <Button
              loading={uploads.starting || uploads.finishing}
              disabled={uploads.hasUnresolvedTasks}
              onClick={() => void uploads.startSelected()}
            >
              {uploads.hasUnresolvedTasks
                ? 'Resolve uploads above'
                : uploads.occurrenceFiles.length || uploads.predictorFiles.length
                  ? 'Upload and profile'
                  : 'Complete inputs and profile'}
            </Button>
          </div>
        </>
      ) : null}
    </SetupShell>
  );
};
