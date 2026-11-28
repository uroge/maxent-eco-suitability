'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activeUploadDatasetsResponseSchema,
  analysisInputManifestResponseSchema,
  type ActiveUploadDataset,
  type ActiveUploadDatasetsResponse,
  type UploadDatasetFormat,
} from '@ecosuitability/contracts';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { matchesRestoredFiles } from './data-upload-model';
import { createTaskProgressThrottle } from './task-progress-throttle';
import { useDataUploadMutations } from './useDataUploadMutations';
import {
  hasUnresolvedUploadTasks,
  createUploadWorkflow,
  isUploadFinishing,
  isUploadStarting,
  selectUploadTasks,
  uploadWorkflowProgress,
  type OccurrenceFormat,
  type UploadTask,
} from './upload-workflow-machine';

type NavigationMode = 'push' | 'replace';

const createTask = ({
  datasetId,
  files,
  format,
  kind,
  replaceDatasetId,
}: {
  datasetId?: string;
  files: File[];
  format: UploadDatasetFormat;
  kind: 'occurrence' | 'predictor';
  replaceDatasetId?: string;
}): UploadTask => ({
  datasetId,
  files,
  format,
  key: crypto.randomUUID(),
  kind,
  progress: 0,
  replaceDatasetId,
  resume: { completedParts: new Map() },
  status: 'waiting',
});

const predictorFormat = (file: File): UploadDatasetFormat =>
  file.name.toLowerCase().endsWith('.zip') ? 'geotiff-zip' : 'geotiff';

const mutationMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useDataUploads = (analysisId: string) => {
  const api = useAnalysisApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const controllers = useRef(new Map<string, AbortController>());
  const exampleController = useRef<AbortController | undefined>(undefined);
  const exampleStarted = useRef(false);
  const finishInFlight = useRef(false);
  const startInFlight = useRef(false);
  const [workflow] = useState(createUploadWorkflow);
  const state = useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot
  );
  const { dispatch } = workflow;
  const progress = useMemo(
    () =>
      createTaskProgressThrottle((taskId, value) => {
        dispatch({ type: 'task-progressed', taskId, progress: value });
      }),
    [dispatch]
  );
  const mutations = useDataUploadMutations({ analysisId, dispatch, progress });
  const attachCompleted = mutations.attachCompleted.mutateAsync;
  const completeInputs = mutations.completeInputs.mutateAsync;
  const discardServerUpload = mutations.discardUpload.mutateAsync;
  const invalidateFinishedWorkflow = mutations.invalidateFinishedWorkflow;
  const loadExampleAssets = mutations.loadExample.mutateAsync;
  const removeInput = mutations.removeInput.mutateAsync;
  const requestProfile = mutations.requestProfile.mutateAsync;
  const uploadTask = mutations.upload.mutateAsync;
  const inputs = useQuery({
    queryKey: analysisKeys.inputs(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/inputs`, analysisInputManifestResponseSchema),
  });
  const activeUploads = useQuery({
    queryKey: analysisKeys.uploads(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/upload-datasets`, activeUploadDatasetsResponseSchema),
  });

  const finishInputs = useCallback(
    async (navigation: NavigationMode): Promise<boolean> => {
      const current = workflow.getSnapshot();
      if (
        finishInFlight.current ||
        isUploadFinishing(current.phase) ||
        current.phase === 'loading-example'
      ) {
        return false;
      }
      const uploads = queryClient.getQueryData<ActiveUploadDatasetsResponse>(
        analysisKeys.uploads(analysisId)
      );
      if (
        hasUnresolvedUploadTasks(current) ||
        controllers.current.size > 0 ||
        uploads?.uploads.length
      ) {
        dispatch({ type: 'batch-settled' });
        return false;
      }
      finishInFlight.current = true;
      dispatch({ type: 'completion-started' });
      try {
        const completed = await completeInputs();
        dispatch({ type: 'profiling-started' });
        await requestProfile({
          expectedInputRevision: completed.analysis.inputRevision,
        });
        await invalidateFinishedWorkflow();
        dispatch({ type: 'redirect-started', message: 'Profiling started. Opening Validation…' });
        const destination = `/analyses/${analysisId}/setup/validation`;
        if (navigation === 'replace') {
          router.replace(destination);
        } else {
          router.push(destination);
        }
        return true;
      } catch (error) {
        dispatch({
          type: 'workflow-failed',
          message: mutationMessage(error, 'Inputs could not be completed.'),
        });
        return false;
      } finally {
        finishInFlight.current = false;
      }
    },
    [
      analysisId,
      completeInputs,
      dispatch,
      invalidateFinishedWorkflow,
      queryClient,
      requestProfile,
      router,
      workflow,
    ]
  );

  const runTask = useCallback(
    async (taskId: string): Promise<void> => {
      const current = workflow.getSnapshot();
      const task = current.tasksById[taskId];
      if (
        !task ||
        task.status === 'complete' ||
        controllers.current.has(taskId) ||
        (task.datasetId && current.restoredAttachments[task.datasetId] === 'attaching') ||
        finishInFlight.current ||
        isUploadFinishing(current.phase)
      ) {
        return;
      }
      const controller = new AbortController();
      controllers.current.set(taskId, controller);
      try {
        await uploadTask({ controller, task });
      } catch {
        // The mutation already records the failure or pause on the task.
      } finally {
        controllers.current.delete(taskId);
      }
    },
    [uploadTask, workflow]
  );

  const runBatch = useCallback(
    async (
      tasks: UploadTask[],
      navigation: NavigationMode,
      clearSelection: boolean
    ): Promise<boolean> => {
      if (finishInFlight.current || isUploadFinishing(workflow.getSnapshot().phase)) {
        return false;
      }
      dispatch({ type: 'tasks-added', tasks, clearSelection });
      await Promise.all(tasks.map(({ key }) => runTask(key)));
      return finishInputs(navigation);
    },
    [dispatch, finishInputs, runTask, workflow]
  );

  const startSelected = useCallback(async (): Promise<void> => {
    if (startInFlight.current) {
      return;
    }
    startInFlight.current = true;
    try {
      const tasks: UploadTask[] = [];
      if (state.occurrenceFiles.length) {
        tasks.push(
          createTask({
            files: state.occurrenceFiles,
            format: state.format,
            kind: 'occurrence',
          })
        );
      }
      for (const file of state.predictorFiles) {
        tasks.push(createTask({ files: [file], format: predictorFormat(file), kind: 'predictor' }));
      }
      if (!tasks.length) {
        await finishInputs('push');
        return;
      }
      await runBatch(tasks, 'push', true);
    } finally {
      startInFlight.current = false;
    }
  }, [finishInputs, runBatch, state.format, state.occurrenceFiles, state.predictorFiles]);

  const startExample = useCallback(async (): Promise<void> => {
    if (exampleStarted.current) {
      return;
    }
    exampleStarted.current = true;
    dispatch({ type: 'example-loading' });
    const controller = new AbortController();
    exampleController.current = controller;
    try {
      const assets = await loadExampleAssets(controller.signal);
      await runBatch(
        [
          createTask({ files: [assets.occurrence], format: 'csv', kind: 'occurrence' }),
          createTask({ files: [assets.predictor], format: 'geotiff', kind: 'predictor' }),
        ],
        'replace',
        false
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        dispatch({
          type: 'workflow-failed',
          message: mutationMessage(error, 'Example setup failed.'),
        });
      }
    } finally {
      if (exampleController.current === controller) {
        exampleController.current = undefined;
      }
    }
  }, [dispatch, loadExampleAssets, runBatch]);

  const resumeServerUpload = useCallback(
    async (upload: ActiveUploadDataset, files: File[]): Promise<void> => {
      const current = workflow.getSnapshot();
      const existingTask = selectUploadTasks(current).find((task) => task.datasetId === upload.id);
      if (
        finishInFlight.current ||
        isUploadFinishing(current.phase) ||
        current.restoredAttachments[upload.id] === 'attaching' ||
        (existingTask && controllers.current.has(existingTask.key))
      ) {
        return;
      }
      if (upload.files.length > 0 && upload.files.every((file) => file.status === 'completed')) {
        dispatch({ type: 'restored-attachment-started', datasetId: upload.id });
        try {
          await attachCompleted(upload);
        } catch (error) {
          dispatch({
            type: 'restored-attachment-settled',
            datasetId: upload.id,
            outcome: 'failed',
          });
          dispatch({
            type: 'workflow-failed',
            message: mutationMessage(error, 'The completed upload could not be attached.'),
          });
          return;
        }
        dispatch({
          type: 'restored-attachment-settled',
          datasetId: upload.id,
          outcome: 'attached',
        });
        await finishInputs('push');
        return;
      }
      if (!matchesRestoredFiles(upload, files)) {
        dispatch({
          type: 'workflow-failed',
          message:
            'Select the same local files (matching names and sizes) to resume. Checksums are verified before reuse.',
        });
        return;
      }
      const task = existingTask
        ? { ...existingTask, files }
        : createTask({
            datasetId: upload.id,
            files,
            format: upload.format,
            kind: upload.kind,
            replaceDatasetId: upload.replaceDatasetId ?? undefined,
          });
      dispatch({ type: 'restored-attachment-settled', datasetId: upload.id, outcome: 'resumed' });
      await runBatch([task], 'push', false);
    },
    [attachCompleted, dispatch, finishInputs, runBatch, workflow]
  );

  const replace = useCallback(
    async (
      datasetId: string,
      kind: 'occurrence' | 'predictor',
      format: UploadDatasetFormat,
      files: File[]
    ): Promise<void> => {
      if (!files.length) {
        return;
      }
      await runBatch(
        [
          createTask({
            files,
            format: kind === 'predictor' ? predictorFormat(files[0]!) : format,
            kind,
            replaceDatasetId: datasetId,
          }),
        ],
        'push',
        false
      );
    },
    [runBatch]
  );

  const retry = useCallback(
    async (task: UploadTask): Promise<void> => {
      await runTask(task.key);
      await finishInputs('push');
    },
    [finishInputs, runTask]
  );

  const discardUpload = useCallback(
    async (datasetId: string): Promise<void> => {
      try {
        await discardServerUpload(datasetId);
        dispatch({ type: 'dataset-discarded', datasetId });
      } catch (error) {
        dispatch({
          type: 'workflow-failed',
          message: mutationMessage(error, 'The incomplete upload could not be discarded.'),
        });
      }
    },
    [discardServerUpload, dispatch]
  );

  const remove = useCallback(
    async (datasetId: string): Promise<void> => {
      try {
        await removeInput({
          datasetId,
          inputRevision: inputs.data?.inputs.inputRevision,
        });
      } catch (error) {
        dispatch({
          type: 'workflow-failed',
          message: mutationMessage(error, 'The attached dataset could not be removed.'),
        });
      }
    },
    [dispatch, inputs.data, removeInput]
  );

  const pause = useCallback((taskId: string): void => controllers.current.get(taskId)?.abort(), []);
  const setFormat = useCallback(
    (format: OccurrenceFormat): void => dispatch({ type: 'format-selected', format }),
    [dispatch]
  );
  const setOccurrenceFiles = useCallback(
    (files: File[]): void => dispatch({ type: 'occurrence-files-selected', files }),
    [dispatch]
  );
  const setPredictorFiles = useCallback(
    (files: File[]): void => dispatch({ type: 'predictor-files-selected', files }),
    [dispatch]
  );

  useEffect(
    () => () => {
      exampleStarted.current = false;
      exampleController.current?.abort();
      for (const controller of controllers.current.values()) {
        controller.abort();
      }
      progress.flushAll();
    },
    [progress]
  );

  const tasks = selectUploadTasks(state);
  return {
    actions: {
      discardUpload,
      pause,
      remove,
      replace,
      resumeServerUpload,
      retry,
      setFormat,
      setOccurrenceFiles,
      setPredictorFiles,
      startExample,
      startSelected,
    },
    derived: {
      finishing: isUploadFinishing(state.phase),
      hasOccurrence: Boolean(
        inputs.data?.inputs.datasets.some((entry) => entry.dataset.kind === 'occurrence')
      ),
      hasUnresolvedTasks:
        hasUnresolvedUploadTasks(state) || Boolean(activeUploads.data?.uploads.length),
      progress: uploadWorkflowProgress(state),
      starting: isUploadStarting(state.phase),
    },
    queries: { activeUploads, inputs },
    state: { ...state, tasks },
  };
};
