import { fireEvent, render, screen } from '@testing-library/react';
import type { ActiveUploadDataset, AnalysisInputManifest } from '@ecosuitability/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AttachedDatasetsPanel } from './AttachedDatasetsPanel';
import { DatasetSelectionPanels } from './DatasetSelectionPanels';
import { IncompleteUploadsPanel } from './IncompleteUploadsPanel';
import { UploadTaskRow } from './UploadTaskRow';
import type { UploadTask } from './upload-workflow-machine';

const dataset = {
  analysisId: 'an_0123456789abcdef0123456789abcdef',
  createdAt: '2026-11-03T10:00:00.000Z',
  expiresAt: '2026-11-05T10:00:00.000Z',
  format: 'csv' as const,
  id: 'ds_11111111111111111111111111111111',
  kind: 'occurrence' as const,
  status: 'ready' as const,
};

describe('focused upload panels', () => {
  it('reports occurrence and predictor selections through the selection panel', () => {
    const onOccurrenceFilesChange = vi.fn();
    const onPredictorFilesChange = vi.fn();
    const { container } = render(
      <DatasetSelectionPanels
        format="csv"
        hasOccurrence={false}
        occurrenceFiles={[]}
        predictorFiles={[]}
        onFormatChange={vi.fn()}
        onOccurrenceFilesChange={onOccurrenceFilesChange}
        onPredictorFilesChange={onPredictorFilesChange}
      />
    );
    const inputs = container.querySelectorAll('input[type="file"]');
    const occurrence = new File(['points'], 'points.csv');
    const predictor = new File(['raster'], 'elevation.tif');

    fireEvent.change(inputs[0]!, { target: { files: [occurrence] } });
    fireEvent.change(inputs[1]!, { target: { files: [predictor] } });
    expect(onOccurrenceFilesChange).toHaveBeenCalledWith([occurrence]);
    expect(onPredictorFilesChange).toHaveBeenCalledWith([predictor]);
  });

  it('keeps resume and discard actions inside the incomplete-upload panel', () => {
    const upload: ActiveUploadDataset = {
      ...dataset,
      files: [],
      replaceDatasetId: null,
      status: 'collecting',
    };
    const onDiscard = vi.fn();
    const onResume = vi.fn();
    const { container } = render(
      <IncompleteUploadsPanel uploads={[upload]} onDiscard={onDiscard} onResume={onResume} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledWith(upload.id);
    const selected = new File(['points'], 'points.csv');
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [selected] },
    });
    expect(onResume).toHaveBeenCalledWith(upload, [selected]);
  });

  it('keeps replacement and removal actions inside the attached-dataset panel', () => {
    const manifest: AnalysisInputManifest = {
      analysisId: dataset.analysisId,
      datasets: [
        {
          attachedAt: '2026-11-03T10:05:00.000Z',
          dataset,
          files: [
            {
              component: null,
              contentType: 'text/csv',
              declaredSha256: 'a'.repeat(64),
              originalName: 'points.csv',
              sha256Verification: 'worker-verified',
              size: 10,
              uploadId: 'up_11111111111111111111111111111111',
            },
          ],
        },
      ],
      inputRevision: 1,
    };
    const onRemove = vi.fn();
    const onReplace = vi.fn();
    const { container } = render(
      <AttachedDatasetsPanel manifest={manifest} onRemove={onRemove} onReplace={onReplace} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith(dataset.id);
    const replacement = new File(['new points'], 'replacement.csv');
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [replacement] },
    });
    expect(onReplace).toHaveBeenCalledWith(dataset.id, dataset.kind, dataset.format, [replacement]);
  });

  it('shows task-specific pause and retry controls', () => {
    const base: UploadTask = {
      files: [new File(['raster'], 'elevation.tif')],
      format: 'geotiff',
      key: 'task-one',
      kind: 'predictor',
      progress: 40,
      resume: { completedParts: new Map() },
      status: 'uploading',
    };
    const onPause = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(
      <ul>
        <UploadTaskRow task={base} onPause={onPause} onRetry={onRetry} />
      </ul>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPause).toHaveBeenCalledWith(base.key);

    const failed = { ...base, message: 'Upload failed.', status: 'failed' as const };
    rerender(
      <ul>
        <UploadTaskRow task={failed} onPause={onPause} onRetry={onRetry} />
      </ul>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith(failed);
  });
});
