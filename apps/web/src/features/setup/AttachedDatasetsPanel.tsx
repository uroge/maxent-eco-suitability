'use client';

import type { AnalysisInputManifestResponse, UploadDatasetFormat } from '@ecosuitability/contracts';
import { Button, Card } from '@ecosuitability/ui';
import { Trash2 } from 'lucide-react';
import { formatAccept } from './data-upload-model';

type AttachedDatasetsPanelProps = {
  manifest?: AnalysisInputManifestResponse['inputs'];
  onRemove: (datasetId: string) => void;
  onReplace: (
    datasetId: string,
    kind: 'occurrence' | 'predictor',
    format: UploadDatasetFormat,
    files: File[]
  ) => void;
};

export const AttachedDatasetsPanel: React.FC<AttachedDatasetsPanelProps> = ({
  manifest,
  onRemove,
  onReplace,
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
                  accept={formatAccept(dataset.format)}
                  className="sr-only"
                  multiple={dataset.format === 'shapefile'}
                  type="file"
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
              <Button size="sm" variant="ghost" onClick={() => onRemove(dataset.id)}>
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
