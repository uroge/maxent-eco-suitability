'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activeUploadDatasetsResponseSchema,
  analysisInputManifestResponseSchema,
  analysisResponseSchema,
  type ActiveUploadDataset,
  type UploadDatasetFormat,
} from '@ecosuitability/contracts';
import { uploadDataset } from '@/lib/direct-upload';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import {
  fileIntent,
  matchesRestoredFiles,
  shapefileComponent,
  type OccurrenceFormat,
  type UploadTask,
} from './data-upload-model';

export const useDataUploads = (analysisId: string) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const controllers = useRef(new Map<string, AbortController>());
  const startInFlight = useRef(false);
  const [format, setFormat] = useState<OccurrenceFormat>('csv');
  const [occurrenceFiles, setOccurrenceFiles] = useState<File[]>([]);
  const [predictorFiles, setPredictorFiles] = useState<File[]>([]);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [message, setMessage] = useState<string>();
  const [finishing, setFinishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const inputs = useQuery({
    queryKey: analysisKeys.inputs(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/inputs`, analysisInputManifestResponseSchema),
  });
  const activeUploads = useQuery({
    queryKey: [...analysisKeys.inputs(analysisId), 'uploads'],
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/upload-datasets`, activeUploadDatasetsResponseSchema),
  });

  const patchTask = (key: string, patch: Partial<UploadTask>): void => {
    setTasks((current) => current.map((task) => (task.key === key ? { ...task, ...patch } : task)));
  };

  const runTask = async (task: UploadTask): Promise<boolean> => {
    if (controllers.current.has(task.key)) {
      return false;
    }

    const controller = new AbortController();
    controllers.current.set(task.key, controller);
    patchTask(task.key, { status: 'uploading', message: undefined });
    try {
      const datasetId = await uploadDataset(
        api,
        analysisId,
        task.kind,
        task.format,
        task.files.map((file) => ({
          file,
          component: task.format === 'shapefile' ? shapefileComponent(file) : undefined,
        })),
        {
          idempotencyKey: idempotencyKey('upload-dataset', analysisId, {
            kind: task.kind,
            format: task.format,
            replaceDatasetId: task.replaceDatasetId,
            files: fileIntent(task.files),
          }),
          datasetId: task.datasetId,
          replaceDatasetId: task.replaceDatasetId,
          resume: task.resume,
          signal: controller.signal,
          onDatasetReady: (datasetId) => {
            task.datasetId = datasetId;
            patchTask(task.key, { datasetId });
          },
          onProgress: ({ loadedBytes, totalBytes }) =>
            patchTask(task.key, { progress: Math.round((loadedBytes / totalBytes) * 100) }),
        }
      );
      patchTask(task.key, { datasetId, progress: 100, status: 'complete' });
      return true;
    } catch (error) {
      const paused = error instanceof DOMException && error.name === 'AbortError';
      patchTask(task.key, {
        status: paused ? 'paused' : 'failed',
        message: paused
          ? 'Paused. The server upload session is retained.'
          : error instanceof Error
            ? error.message
            : 'Upload failed.',
      });
      return false;
    } finally {
      controllers.current.delete(task.key);
      await Promise.all([inputs.refetch(), activeUploads.refetch()]);
    }
  };

  const finishInputs = async (): Promise<void> => {
    if (finishing) {
      return;
    }

    setFinishing(true);
    setMessage(undefined);
    try {
      const refreshed = await api.json(
        `/v1/analyses/${analysisId}/inputs`,
        analysisInputManifestResponseSchema
      );
      const completeBody = { expectedInputRevision: refreshed.inputs.inputRevision };
      const completedResponse = await api.request(`/v1/analyses/${analysisId}/inputs/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('complete-inputs', analysisId, completeBody),
        },
        body: JSON.stringify(completeBody),
      });
      if (!completedResponse.ok) {
        throw new Error('One occurrence dataset and at least one predictor are required.');
      }
      const completed = analysisResponseSchema.parse(await completedResponse.json());
      const profileBody = { expectedInputRevision: completed.analysis.inputRevision };
      const profileResponse = await api.request(`/v1/analyses/${analysisId}/input-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('input-profile', analysisId, profileBody),
        },
        body: JSON.stringify(profileBody),
      });
      if (!profileResponse.ok) {
        throw new Error(
          'The files are attached, but profiling could not be queued. Retry from Validation.'
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
      setMessage('Profiling started. Opening Validation…');
      router.push(`/analyses/${analysisId}/setup/validation`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Inputs could not be completed.');
      setFinishing(false);
    }
  };

  const startSelected = async (): Promise<void> => {
    if (startInFlight.current) {
      return;
    }

    startInFlight.current = true;
    setStarting(true);
    const created: UploadTask[] = [];
    try {
      if (occurrenceFiles.length) {
        created.push({
          key: crypto.randomUUID(),
          kind: 'occurrence',
          format,
          files: occurrenceFiles,
          progress: 0,
          status: 'waiting',
          resume: { completedParts: new Map() },
        });
      }
      for (const file of predictorFiles) {
        created.push({
          key: crypto.randomUUID(),
          kind: 'predictor',
          format: file.name.toLowerCase().endsWith('.zip') ? 'geotiff-zip' : 'geotiff',
          files: [file],
          progress: 0,
          status: 'waiting',
          resume: { completedParts: new Map() },
        });
      }
      if (!created.length) {
        await finishInputs();
        return;
      }

      setOccurrenceFiles([]);
      setPredictorFiles([]);
      setTasks((current) => [...current, ...created]);
      const results = await Promise.all(created.map(runTask));
      if (results.every(Boolean)) {
        await finishInputs();
      }
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  };

  const resumeServerUpload = async (upload: ActiveUploadDataset, files: File[]): Promise<void> => {
    if (upload.files.length > 0 && upload.files.every((file) => file.status === 'completed')) {
      const response = await api.request(
        `/v1/analyses/${analysisId}/upload-datasets/${upload.id}/complete`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey('attach-upload', analysisId, upload.id) },
        }
      );
      if (response.ok) {
        await finishInputs();
      } else {
        setMessage('The completed upload could not be attached yet. Retry shortly or discard it.');
      }
      return;
    }
    if (!matchesRestoredFiles(upload, files)) {
      setMessage(
        'Select the same local files (matching names and sizes) to resume. Checksums are verified before reuse.'
      );
      return;
    }
    const task: UploadTask = {
      key: crypto.randomUUID(),
      kind: upload.kind,
      format: upload.format,
      files,
      replaceDatasetId: upload.replaceDatasetId ?? undefined,
      datasetId: upload.id,
      progress: 0,
      status: 'waiting',
      resume: { completedParts: new Map() },
    };
    setTasks((current) => [...current, task]);
    if (await runTask(task)) {
      await finishInputs();
    }
  };

  const replace = async (
    datasetId: string,
    kind: 'occurrence' | 'predictor',
    currentFormat: UploadDatasetFormat,
    files: File[]
  ): Promise<void> => {
    if (!files.length) {
      return;
    }
    const task: UploadTask = {
      key: crypto.randomUUID(),
      kind,
      format:
        kind === 'predictor'
          ? files[0]!.name.toLowerCase().endsWith('.zip')
            ? 'geotiff-zip'
            : 'geotiff'
          : currentFormat,
      files,
      replaceDatasetId: datasetId,
      progress: 0,
      status: 'waiting',
      resume: { completedParts: new Map() },
    };
    setTasks((current) => [...current, task]);
    if (await runTask(task)) {
      await finishInputs();
    }
  };

  const discardUpload = async (datasetId: string): Promise<void> => {
    const response = await api.request(`/v1/analyses/${analysisId}/upload-datasets/${datasetId}`, {
      method: 'DELETE',
      headers: { 'Idempotency-Key': idempotencyKey('discard-upload', analysisId, datasetId) },
    });
    if (response.ok) {
      await activeUploads.refetch();
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
      await queryClient.invalidateQueries({ queryKey: ['analysis', analysisId] });
    }
  };

  return {
    inputs,
    activeUploads,
    format,
    setFormat,
    occurrenceFiles,
    setOccurrenceFiles,
    predictorFiles,
    setPredictorFiles,
    tasks,
    message,
    finishing,
    starting,
    hasUnresolvedTasks: tasks.some((task) => task.status !== 'complete'),
    hasOccurrence: Boolean(
      inputs.data?.inputs.datasets.some((entry) => entry.dataset.kind === 'occurrence')
    ),
    startSelected,
    resumeServerUpload,
    replace,
    discardUpload,
    remove,
    pause: (taskKey: string) => controllers.current.get(taskKey)?.abort(),
    retry: (task: UploadTask) => runTask(task),
  };
};
