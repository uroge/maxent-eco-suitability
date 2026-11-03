import type { UploadDatasetFormat } from '@ecosuitability/contracts';
import type { DirectUploadResumeState } from '@/lib/direct-upload';

export type OccurrenceFormat = 'csv' | 'xlsx' | 'geojson' | 'gpkg' | 'shapefile';

export type UploadWorkflowPhase =
  'idle' | 'loading-example' | 'uploading' | 'completing' | 'profiling' | 'redirecting' | 'failed';

export type UploadTask = Readonly<{
  datasetId?: string;
  files: File[];
  format: UploadDatasetFormat;
  key: string;
  kind: 'occurrence' | 'predictor';
  message?: string;
  progress: number;
  replaceDatasetId?: string;
  resume: DirectUploadResumeState;
  status: 'waiting' | 'uploading' | 'paused' | 'failed' | 'complete';
}>;

export type UploadWorkflowState = Readonly<{
  format: OccurrenceFormat;
  message?: string;
  occurrenceFiles: File[];
  phase: UploadWorkflowPhase;
  predictorFiles: File[];
  taskIds: string[];
  tasksById: Readonly<Record<string, UploadTask>>;
}>;

export type UploadWorkflowEvent =
  | { type: 'format-selected'; format: OccurrenceFormat }
  | { type: 'occurrence-files-selected'; files: File[] }
  | { type: 'predictor-files-selected'; files: File[] }
  | { type: 'example-loading' }
  | { type: 'tasks-added'; tasks: UploadTask[]; clearSelection: boolean }
  | { type: 'task-started'; taskId: string }
  | { type: 'task-dataset-ready'; taskId: string; datasetId: string }
  | { type: 'task-progressed'; taskId: string; progress: number }
  | { type: 'task-paused'; taskId: string; message: string }
  | { type: 'task-failed'; taskId: string; message: string }
  | { type: 'task-completed'; taskId: string; datasetId: string }
  | { type: 'batch-settled' }
  | { type: 'completion-started' }
  | { type: 'profiling-started' }
  | { type: 'redirect-started'; message: string }
  | { type: 'workflow-failed'; message: string }
  | { type: 'message-cleared' };

export const initialUploadWorkflowState: UploadWorkflowState = {
  format: 'csv',
  occurrenceFiles: [],
  phase: 'idle',
  predictorFiles: [],
  taskIds: [],
  tasksById: {},
};

const updateTask = (
  state: UploadWorkflowState,
  taskId: string,
  update: (task: UploadTask) => UploadTask
): UploadWorkflowState => {
  const task = state.tasksById[taskId];
  if (!task) {
    return state;
  }
  const nextTask = update(task);
  if (nextTask === task) {
    return state;
  }
  return {
    ...state,
    tasksById: { ...state.tasksById, [taskId]: nextTask },
  };
};

const clampProgress = (progress: number): number =>
  Math.min(100, Math.max(0, Math.round(progress)));

export const uploadWorkflowReducer = (
  state: UploadWorkflowState,
  event: UploadWorkflowEvent
): UploadWorkflowState => {
  switch (event.type) {
    case 'format-selected':
      return { ...state, format: event.format, occurrenceFiles: [], message: undefined };
    case 'occurrence-files-selected':
      return { ...state, occurrenceFiles: event.files, message: undefined };
    case 'predictor-files-selected':
      return { ...state, predictorFiles: event.files, message: undefined };
    case 'example-loading':
      if (state.phase !== 'idle' && state.phase !== 'failed') {
        return state;
      }
      return { ...state, phase: 'loading-example', message: undefined };
    case 'tasks-added': {
      const tasksById = { ...state.tasksById };
      const taskIds = [...state.taskIds];
      for (const task of event.tasks) {
        if (!tasksById[task.key]) {
          taskIds.push(task.key);
        }
        tasksById[task.key] = task;
      }
      return {
        ...state,
        ...(event.clearSelection ? { occurrenceFiles: [], predictorFiles: [] } : {}),
        message: undefined,
        phase: 'uploading',
        taskIds,
        tasksById,
      };
    }
    case 'task-started': {
      const updated = updateTask(state, event.taskId, (task) => {
        if (task.status === 'complete' || task.status === 'uploading') {
          return task;
        }
        return { ...task, message: undefined, status: 'uploading' };
      });
      return updated === state ? state : { ...updated, message: undefined, phase: 'uploading' };
    }
    case 'task-dataset-ready':
      return updateTask(state, event.taskId, (task) => ({
        ...task,
        datasetId: event.datasetId,
      }));
    case 'task-progressed':
      return updateTask(state, event.taskId, (task) => {
        if (task.status !== 'uploading') {
          return task;
        }
        const progress = Math.max(task.progress, clampProgress(event.progress));
        return progress === task.progress ? task : { ...task, progress };
      });
    case 'task-paused':
      return updateTask(state, event.taskId, (task) =>
        task.status === 'uploading' ? { ...task, message: event.message, status: 'paused' } : task
      );
    case 'task-failed':
      return updateTask(state, event.taskId, (task) =>
        task.status === 'complete' ? task : { ...task, message: event.message, status: 'failed' }
      );
    case 'task-completed':
      return updateTask(state, event.taskId, (task) => ({
        ...task,
        datasetId: event.datasetId,
        message: undefined,
        progress: 100,
        status: 'complete',
      }));
    case 'batch-settled':
      return state.phase === 'uploading'
        ? {
            ...state,
            phase: state.taskIds.every((taskId) => state.tasksById[taskId]?.status === 'complete')
              ? 'idle'
              : 'failed',
          }
        : state;
    case 'completion-started':
      return { ...state, phase: 'completing', message: undefined };
    case 'profiling-started':
      return { ...state, phase: 'profiling', message: undefined };
    case 'redirect-started':
      return { ...state, phase: 'redirecting', message: event.message };
    case 'workflow-failed':
      return { ...state, phase: 'failed', message: event.message };
    case 'message-cleared':
      return { ...state, message: undefined };
  }
};

export const selectUploadTasks = (state: UploadWorkflowState): UploadTask[] =>
  state.taskIds.flatMap((taskId) => {
    const task = state.tasksById[taskId];
    return task ? [task] : [];
  });

export const hasUnresolvedUploadTasks = (state: UploadWorkflowState): boolean =>
  state.taskIds.some((taskId) => state.tasksById[taskId]?.status !== 'complete');

export const isUploadStarting = (phase: UploadWorkflowPhase): boolean =>
  phase === 'loading-example' || phase === 'uploading';

export const isUploadFinishing = (phase: UploadWorkflowPhase): boolean =>
  phase === 'completing' || phase === 'profiling' || phase === 'redirecting';

export const uploadWorkflowProgress = (state: UploadWorkflowState): number => {
  if (state.phase === 'loading-example') {
    return 5;
  }
  if (state.phase === 'completing') {
    return 90;
  }
  if (state.phase === 'profiling') {
    return 95;
  }
  if (state.phase === 'redirecting') {
    return 100;
  }
  const tasks = selectUploadTasks(state);
  if (!tasks.length) {
    return 0;
  }
  return Math.round(tasks.reduce((total, task) => total + task.progress, 0) / tasks.length);
};
