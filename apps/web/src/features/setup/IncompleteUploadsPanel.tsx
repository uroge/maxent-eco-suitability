'use client';

import type { ActiveUploadDataset } from '@ecosuitability/contracts';
import { Button, Card } from '@ecosuitability/ui';
import { RefreshCw } from 'lucide-react';
import { formatAccept } from './data-upload-model';

type IncompleteUploadsPanelProps = {
  onDiscard: (datasetId: string) => void;
  onResume: (upload: ActiveUploadDataset, files: File[]) => void;
  uploads: ActiveUploadDataset[];
};

export const IncompleteUploadsPanel: React.FC<IncompleteUploadsPanelProps> = ({
  onDiscard,
  onResume,
  uploads,
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
                    accept={formatAccept(upload.format)}
                    className="sr-only"
                    multiple={upload.format === 'shapefile'}
                    type="file"
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
