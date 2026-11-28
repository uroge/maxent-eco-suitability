'use client';

import { useCallback, type Dispatch } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  analysisInputManifestResponseSchema,
  analysisInputProfileResponseSchema,
  analysisResponseSchema,
  uploadDatasetResponseSchema,
  type ActiveUploadDataset,
  type AnalysisInputProfileResponse,
  type AnalysisResponse,
  type UploadDatasetResponse,
} from '@ecosuitability/contracts';
import { responseError } from '@/lib/api-error';
import { uploadDataset } from '@/lib/direct-upload';
import { analysisKeys, idempotencyKey, useAnalysisApi } from '../analysis/api';
import { fileIntent, shapefileComponent } from './data-upload-model';
import type { TaskProgressThrottle } from './task-progress-throttle';
import type { UploadTask, UploadWorkflowEvent } from './upload-workflow-machine';

type UploadTaskVariables = {
  controller: AbortController;
  task: UploadTask;
};

type ExampleAssets = {
  occurrence: File;
  predictor: File;
};

const noContent = async (response: Response): Promise<void> => {
  if (!response.ok) {
    throw await responseError(response);
  }
};

const errorMessage = (error: Error): string =>
  error.message || 'The upload operation could not be completed.';

export const useDataUploadMutations = ({
  analysisId,
  dispatch,
  progress,
}: {
  analysisId: string;
  dispatch: Dispatch<UploadWorkflowEvent>;
  progress: TaskProgressThrottle;
}) => {
  const api = useAnalysisApi();
  const queryClient = useQueryClient();

  const invalidateUploads = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: analysisKeys.inputs(analysisId) }),
      queryClient.invalidateQueries({ queryKey: analysisKeys.uploads(analysisId) }),
    ]);
  };

  const loadExample = useMutation<ExampleAssets, Error, AbortSignal>({
    mutationFn: async (signal) => {
      const [occurrenceResponse, predictorResponse] = await Promise.all([
        fetch('/example/synthetic-occurrences.csv', { signal }),
        fetch('/example/synthetic-elevation.tif', { signal }),
      ]);
      if (!occurrenceResponse.ok || !predictorResponse.ok) {
        throw new Error('Example assets are unavailable.');
      }
      return {
        occurrence: new File([await occurrenceResponse.blob()], 'synthetic-occurrences.csv', {
          type: 'text/csv',
        }),
        predictor: new File([await predictorResponse.blob()], 'synthetic-elevation.tif', {
          type: 'image/tiff',
        }),
      };
    },
    retry: false,
  });

  const upload = useMutation<string, Error, UploadTaskVariables>({
    mutationFn: ({ controller, task }) =>
      uploadDataset(
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
            dispatch({ type: 'task-dataset-ready', taskId: task.key, datasetId });
          },
          onProgress: ({ loadedBytes, totalBytes }) => {
            progress.report(task.key, Math.round((loadedBytes / totalBytes) * 100));
          },
        }
      ),
    onMutate: ({ task }) => {
      dispatch({ type: 'task-started', taskId: task.key });
    },
    onSuccess: (datasetId, { task }) => {
      progress.report(task.key, 100);
      progress.flush(task.key);
      dispatch({ type: 'task-completed', taskId: task.key, datasetId });
    },
    onError: (error, { task }) => {
      progress.flush(task.key);
      const paused = error instanceof DOMException && error.name === 'AbortError';
      dispatch(
        paused
          ? {
              type: 'task-paused',
              taskId: task.key,
              message: 'Paused. The server upload session is retained.',
            }
          : { type: 'task-failed', taskId: task.key, message: errorMessage(error) }
      );
    },
    onSettled: invalidateUploads,
    retry: false,
  });

  const attachCompleted = useMutation<UploadDatasetResponse, Error, ActiveUploadDataset>({
    mutationFn: (serverUpload) =>
      api.json(
        `/v1/analyses/${analysisId}/upload-datasets/${serverUpload.id}/complete`,
        uploadDatasetResponseSchema,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': idempotencyKey('attach-upload', analysisId, serverUpload.id),
          },
        }
      ),
    onSuccess: invalidateUploads,
    retry: false,
  });

  const completeInputs = useMutation<AnalysisResponse, Error, void>({
    mutationFn: async () => {
      const manifest = await api.json(
        `/v1/analyses/${analysisId}/inputs`,
        analysisInputManifestResponseSchema
      );
      const body = { expectedInputRevision: manifest.inputs.inputRevision };
      return api.json(`/v1/analyses/${analysisId}/inputs/complete`, analysisResponseSchema, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('complete-inputs', analysisId, body),
        },
        body: JSON.stringify(body),
      });
    },
    retry: false,
  });

  const requestProfile = useMutation<
    AnalysisInputProfileResponse,
    Error,
    { expectedInputRevision: number }
  >({
    mutationFn: (body) =>
      api.json(`/v1/analyses/${analysisId}/input-profile`, analysisInputProfileResponseSchema, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey('input-profile', analysisId, body),
        },
        body: JSON.stringify(body),
      }),
    retry: false,
  });

  const discardUpload = useMutation<void, Error, string>({
    mutationFn: async (datasetId) => {
      await noContent(
        await api.request(`/v1/analyses/${analysisId}/upload-datasets/${datasetId}`, {
          method: 'DELETE',
          headers: { 'Idempotency-Key': idempotencyKey('discard-upload', analysisId, datasetId) },
        })
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: analysisKeys.uploads(analysisId) });
    },
    retry: false,
  });

  const removeInput = useMutation<
    void,
    Error,
    { datasetId: string; inputRevision: number | undefined }
  >({
    mutationFn: async ({ datasetId, inputRevision }) => {
      await noContent(
        await api.request(`/v1/analyses/${analysisId}/inputs/${datasetId}`, {
          method: 'DELETE',
          headers: {
            'Idempotency-Key': idempotencyKey('remove-input', analysisId, {
              datasetId,
              inputRevision,
            }),
          },
        })
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: analysisKeys.analysis(analysisId) }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.inputs(analysisId) }),
      ]);
    },
    retry: false,
  });

  const invalidateFinishedWorkflow = useCallback(async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: analysisKeys.analysis(analysisId) }),
      queryClient.invalidateQueries({ queryKey: analysisKeys.inputs(analysisId) }),
      queryClient.invalidateQueries({ queryKey: analysisKeys.uploads(analysisId) }),
      queryClient.invalidateQueries({ queryKey: analysisKeys.profile(analysisId) }),
    ]);
  }, [analysisId, queryClient]);

  return {
    attachCompleted,
    completeInputs,
    discardUpload,
    invalidateFinishedWorkflow,
    loadExample,
    removeInput,
    requestProfile,
    upload,
  };
};
