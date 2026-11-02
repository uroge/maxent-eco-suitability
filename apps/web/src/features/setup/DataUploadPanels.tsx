'use client';

import type {
  ActiveUploadDataset,
  AnalysisInputManifestResponse,
  UploadDatasetFormat,
} from '@ecosuitability/contracts';
import {
  Button,
  Card,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ecosuitability/ui';
import { RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import { formatAccept, type OccurrenceFormat, type UploadTask } from './data-upload-model';

type IncompleteUploadsPanelProps = {
  uploads: ActiveUploadDataset[];
  onResume: (upload: ActiveUploadDataset, files: File[]) => void;
  onDiscard: (datasetId: string) => void;
};

export const IncompleteUploadsPanel: React.FC<IncompleteUploadsPanelProps> = ({
  uploads,
  onResume,
  onDiscard,
}) => {
  if (uploads.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold">Incomplete uploads</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        After a refresh, reselect matching browser files to continue. Signed URLs refresh
        automatically.
      </p>
      <ul className="mt-3 space-y-3">
        {uploads.map((upload) => {
          const completed =
            upload.files.length > 0 && upload.files.every((file) => file.status === 'completed');
          return (
            <li className="rounded-lg border border-border p-4" key={upload.id}>
              <p className="text-sm font-medium capitalize">
                {upload.replaceDatasetId ? 'Replacement · ' : ''}
                {upload.kind} · {upload.format}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {upload.files.map((file) => `${file.originalName} (${file.status})`).join(', ') ||
                  'Awaiting file selection'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border px-3 text-sm">
                  <RefreshCw className="mr-2" size={15} />
                  Reselect and resume
                  <input
                    className="sr-only"
                    type="file"
                    multiple={upload.format === 'shapefile'}
                    accept={formatAccept(upload.format)}
                    onChange={(event) => {
                      onResume(upload, Array.from(event.target.files ?? []));
                      event.target.value = '';
                    }}
                  />
                </label>
                {completed ? (
                  <Button size="sm" variant="secondary" onClick={() => onResume(upload, [])}>
                    Attach completed upload
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => onDiscard(upload.id)}>
                  Discard
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

type AttachedDatasetsPanelProps = {
  manifest?: AnalysisInputManifestResponse['inputs'];
  onReplace: (
    datasetId: string,
    kind: 'occurrence' | 'predictor',
    format: UploadDatasetFormat,
    files: File[]
  ) => void;
  onRemove: (datasetId: string) => void;
};

export const AttachedDatasetsPanel: React.FC<AttachedDatasetsPanelProps> = ({
  manifest,
  onReplace,
  onRemove,
}) => {
  if (!manifest?.datasets.length) {
    return null;
  }

  return (
    <Card className="mb-6 p-5">
      <h2 className="font-semibold">Attached datasets</h2>
      <ul className="mt-3 divide-y divide-border">
        {manifest.datasets.map(({ dataset, files }) => (
          <li
            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            key={dataset.id}
          >
            <div>
              <p className="text-sm font-medium capitalize">
                {dataset.kind} · {dataset.format}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {files.map((file) => file.originalName).join(', ')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-border px-3 text-sm">
                Replace
                <input
                  className="sr-only"
                  type="file"
                  multiple={dataset.format === 'shapefile'}
                  accept={formatAccept(dataset.format)}
                  onChange={(event) => {
                    onReplace(
                      dataset.id,
                      dataset.kind,
                      dataset.format,
                      Array.from(event.target.files ?? [])
                    );
                    event.target.value = '';
                  }}
                />
              </label>
              <Button variant="ghost" size="sm" onClick={() => onRemove(dataset.id)}>
                <Trash2 size={15} />
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};

type DatasetSelectionPanelsProps = {
  hasOccurrence: boolean;
  format: OccurrenceFormat;
  occurrenceFiles: File[];
  predictorFiles: File[];
  onFormatChange: (format: OccurrenceFormat) => void;
  onOccurrenceFilesChange: (files: File[]) => void;
  onPredictorFilesChange: (files: File[]) => void;
};

export const DatasetSelectionPanels: React.FC<DatasetSelectionPanelsProps> = ({
  hasOccurrence,
  format,
  occurrenceFiles,
  predictorFiles,
  onFormatChange,
  onOccurrenceFilesChange,
  onPredictorFilesChange,
}) => (
  <div className="grid gap-6 lg:grid-cols-2">
    {!hasOccurrence ? (
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Occurrence records</h2>
        <Select value={format} onValueChange={(value) => onFormatChange(value as OccurrenceFormat)}>
          <SelectTrigger className="mt-5" aria-label="Occurrence format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="xlsx">XLSX</SelectItem>
            <SelectItem value="geojson">GeoJSON</SelectItem>
            <SelectItem value="gpkg">GeoPackage</SelectItem>
            <SelectItem value="shapefile">Shapefile components</SelectItem>
          </SelectContent>
        </Select>
        <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 text-center text-sm">
          <UploadCloud className="mb-2 text-primary" />
          Choose occurrence file{format === 'shapefile' ? 's' : ''}
          <span className="mt-1 text-xs text-muted-foreground">
            {occurrenceFiles.map((file) => file.name).join(', ') || 'No local file selected'}
          </span>
          <input
            className="sr-only"
            type="file"
            multiple={format === 'shapefile'}
            accept={formatAccept(format)}
            onChange={(event) => onOccurrenceFilesChange(Array.from(event.target.files ?? []))}
          />
        </label>
      </Card>
    ) : (
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Occurrence records</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          An occurrence dataset is attached. Use Replace above to preserve it until a new upload is
          verified.
        </p>
      </Card>
    )}
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Environmental predictors</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose individual GeoTIFFs or ZIP archives containing one GeoTIFF.
      </p>
      <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 text-center text-sm">
        <UploadCloud className="mb-2 text-primary" />
        Choose predictor files
        <span className="mt-1 text-xs text-muted-foreground">
          {predictorFiles.map((file) => file.name).join(', ') || 'No local files selected'}
        </span>
        <input
          className="sr-only"
          type="file"
          multiple
          accept=".tif,.tiff,.zip,image/tiff,application/zip"
          onChange={(event) => onPredictorFilesChange(Array.from(event.target.files ?? []))}
        />
      </label>
    </Card>
  </div>
);

type UploadTasksPanelProps = {
  tasks: UploadTask[];
  onPause: (taskKey: string) => void;
  onRetry: (task: UploadTask) => void;
};

export const UploadTasksPanel: React.FC<UploadTasksPanelProps> = ({ tasks, onPause, onRetry }) => {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="font-semibold">Upload progress</h2>
      <ul className="mt-3 space-y-4">
        {tasks.map((task) => (
          <li key={task.key}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {task.replaceDatasetId ? 'Replacement · ' : ''}
                {task.files.map((file) => file.name).join(', ')}
              </span>
              <span className="capitalize text-muted-foreground">
                {task.status} · {task.progress}%
              </span>
            </div>
            <Progress value={task.progress} />
            {task.message ? <p className="mt-1 text-xs text-destructive">{task.message}</p> : null}
            <div className="mt-2 flex gap-2">
              {task.status === 'uploading' ? (
                <Button size="sm" variant="secondary" onClick={() => onPause(task.key)}>
                  <X size={15} />
                  Pause
                </Button>
              ) : null}
              {task.status === 'failed' || task.status === 'paused' ? (
                <Button size="sm" variant="secondary" onClick={() => onRetry(task)}>
                  Retry
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
};
