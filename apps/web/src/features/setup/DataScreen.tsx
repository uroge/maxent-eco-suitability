'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analysisInputManifestResponseSchema,
  analysisResponseSchema,
} from '@ecosuitability/contracts';
import { Alert, Button, Card, Progress } from '@ecosuitability/ui';
import { Trash2, UploadCloud, X } from 'lucide-react';
import { uploadDataset, type DirectUploadFile } from '@/lib/direct-upload';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { SetupShell } from './SetupShell';
import { ExampleDatasetFlow } from './ExampleDatasetFlow';

type OccurrenceFormat = 'csv' | 'xlsx' | 'geojson' | 'gpkg' | 'shapefile';

const shapefileComponent = (file: File): DirectUploadFile['component'] => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'shp' ||
    extension === 'shx' ||
    extension === 'dbf' ||
    extension === 'prj' ||
    extension === 'cpg'
    ? extension
    : undefined;
};

const fileIntent = (files: File[]): Array<Record<string, string | number>> =>
  files
    .map((file) => ({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

export const DataScreen: React.FC<{ analysisId: string; example?: boolean }> = ({
  analysisId,
  example = false,
}) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const abortController = useRef<AbortController | null>(null);
  const [format, setFormat] = useState<OccurrenceFormat>('csv');
  const [occurrenceFiles, setOccurrenceFiles] = useState<File[]>([]);
  const [predictorFiles, setPredictorFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const inputs = useQuery({
    queryKey: analysisKeys.inputs(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/inputs`, analysisInputManifestResponseSchema),
  });

  const selectFiles =
    (setter: (files: File[]) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      setter(Array.from(event.target.files ?? []));
    };

  const upload = async (): Promise<void> => {
    if (occurrenceFiles.length === 0 || predictorFiles.length === 0) {
      setMessage('Choose one occurrence dataset and at least one GeoTIFF predictor.');
      return;
    }
    setBusy(true);
    setMessage(undefined);
    const controller = new AbortController();
    abortController.current = controller;
    try {
      await uploadDataset(
        api,
        analysisId,
        'occurrence',
        format,
        occurrenceFiles.map((file) => ({
          file,
          component: format === 'shapefile' ? shapefileComponent(file) : undefined,
        })),
        {
          idempotencyKey: idempotencyKey('occurrence', analysisId, {
            format,
            files: fileIntent(occurrenceFiles),
          }),
          signal: controller.signal,
          onProgress: ({ loadedBytes, totalBytes }) =>
            setProgress(Math.round((loadedBytes / totalBytes) * 45)),
        }
      );
      for (let index = 0; index < predictorFiles.length; index += 1) {
        const file = predictorFiles[index];
        await uploadDataset(
          api,
          analysisId,
          'predictor',
          file.name.toLowerCase().endsWith('.zip') ? 'geotiff-zip' : 'geotiff',
          [{ file }],
          {
            idempotencyKey: idempotencyKey('predictor', analysisId, {
              format: file.name.toLowerCase().endsWith('.zip') ? 'geotiff-zip' : 'geotiff',
              files: fileIntent([file]),
            }),
            signal: controller.signal,
            onProgress: ({ loadedBytes, totalBytes }) =>
              setProgress(
                45 + Math.round(((index + loadedBytes / totalBytes) / predictorFiles.length) * 50)
              ),
          }
        );
      }
      const refreshedInputs = await api.json(
        `/v1/analyses/${analysisId}/inputs`,
        analysisInputManifestResponseSchema
      );
      const completeBody = { expectedInputRevision: refreshedInputs.inputs.inputRevision };
      const completed = await api.request(`/v1/analyses/${analysisId}/inputs/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('complete-inputs', analysisId, completeBody),
        },
        body: JSON.stringify(completeBody),
      });
      if (!completed.ok) {
        throw new Error('The uploaded datasets did not satisfy the input requirements.');
      }
      const completedAnalysis = analysisResponseSchema.parse(await completed.json());
      const profileBody = { expectedInputRevision: completedAnalysis.analysis.inputRevision };
      const profile = await api.request(`/v1/analyses/${analysisId}/input-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('input-profile', analysisId, profileBody),
        },
        body: JSON.stringify(profileBody),
      });
      if (!profile.ok) {
        throw new Error('Input profiling could not be queued.');
      }
      setProgress(100);
      await queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      router.push(`/analyses/${analysisId}/setup/validation`);
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'Upload cancelled. Select the local files again to retry.'
          : error instanceof Error
            ? error.message
            : 'The upload failed.'
      );
    } finally {
      abortController.current = null;
      setBusy(false);
    }
  };

  const remove = async (datasetId: string): Promise<void> => {
    const response = await api.request(`/v1/analyses/${analysisId}/inputs/${datasetId}`, {
      method: 'DELETE',
      headers: {
        'Idempotency-Key': idempotencyKey('remove-input', analysisId, {
          datasetId,
          inputRevision: inputs.data?.inputs.inputRevision,
        }),
      },
    });
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: analysisKeys.inputs(analysisId) });
    }
  };

  return (
    <SetupShell
      analysisId={analysisId}
      current="data"
      title="Add analysis data"
      description="Upload one occurrence dataset and one or more environmental predictors. Files go directly to temporary object storage and remain available for 48 hours."
    >
      {example ? <ExampleDatasetFlow analysisId={analysisId} /> : null}
      {!example ? (
        <>
          {message ? (
            <Alert className="mb-5" variant="warning">
              {message}
            </Alert>
          ) : null}
          {inputs.data?.inputs.datasets.length ? (
            <Card className="mb-6 p-5">
              <h2 className="font-semibold">Attached datasets</h2>
              <ul className="mt-3 divide-y divide-border">
                {inputs.data.inputs.datasets.map(({ dataset, files }) => (
                  <li
                    className="flex min-h-14 items-center justify-between gap-4 py-2"
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
                    <Button variant="ghost" size="sm" onClick={() => remove(dataset.id)}>
                      <Trash2 size={15} />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Occurrence records</h2>
              <label className="mt-5 block text-sm font-medium" htmlFor="occurrence-format">
                Format
              </label>
              <select
                id="occurrence-format"
                className="mt-2 min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                value={format}
                onChange={(event) => setFormat(event.target.value as OccurrenceFormat)}
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
                <option value="geojson">GeoJSON</option>
                <option value="gpkg">GeoPackage</option>
                <option value="shapefile">Shapefile components</option>
              </select>
              <label
                className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 text-center text-sm"
                htmlFor="occurrence-files"
              >
                <UploadCloud className="mb-2 text-primary" />
                Choose occurrence file{format === 'shapefile' ? 's' : ''}
                <span className="mt-1 text-xs text-muted-foreground">
                  {occurrenceFiles.map((file) => file.name).join(', ') || 'No local file selected'}
                </span>
              </label>
              <input
                id="occurrence-files"
                className="sr-only"
                type="file"
                multiple={format === 'shapefile'}
                onChange={selectFiles(setOccurrenceFiles)}
              />
            </Card>
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Environmental predictors</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose individual GeoTIFFs or ZIP archives containing one GeoTIFF.
              </p>
              <label
                className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-subtle p-5 text-center text-sm"
                htmlFor="predictor-files"
              >
                <UploadCloud className="mb-2 text-primary" />
                Choose predictor files
                <span className="mt-1 text-xs text-muted-foreground">
                  {predictorFiles.map((file) => file.name).join(', ') || 'No local files selected'}
                </span>
              </label>
              <input
                id="predictor-files"
                className="sr-only"
                type="file"
                multiple
                accept=".tif,.tiff,.zip,image/tiff,application/zip"
                onChange={selectFiles(setPredictorFiles)}
              />
            </Card>
          </div>
          {busy ? (
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>Hashing and uploading</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          ) : null}
          <div className="mt-8 flex flex-wrap justify-end gap-3">
            {busy ? (
              <Button variant="secondary" onClick={() => abortController.current?.abort()}>
                <X size={16} />
                Cancel upload
              </Button>
            ) : null}
            <Button loading={busy} onClick={upload}>
              Upload and validate
            </Button>
          </div>
        </>
      ) : null}
    </SetupShell>
  );
};
