import { describe, expect, it } from 'vitest';
import {
  hasUnresolvedUploadTasks,
  initialUploadWorkflowState,
  selectUploadTasks,
  uploadWorkflowProgress,
  uploadWorkflowReducer,
  type UploadTask,
  type UploadWorkflowState,
} from './upload-workflow-machine';

const task = (key: string, kind: UploadTask['kind'] = 'predictor'): UploadTask => ({
  files: [new File([key], `${key}.tif`)],
  format: kind === 'predictor' ? 'geotiff' : 'csv',
  key,
  kind,
  progress: 0,
  resume: { completedParts: new Map() },
  status: 'waiting',
});

const reduce = (
  state: UploadWorkflowState,
  ...events: Parameters<typeof uploadWorkflowReducer>[1][]
): UploadWorkflowState => events.reduce(uploadWorkflowReducer, state);

describe('uploadWorkflowReducer', () => {
  it('owns file selection and atomically creates a normalized batch', () => {
    const occurrence = new File(['points'], 'points.csv');
    const predictor = new File(['raster'], 'elevation.tif');
    const selected = reduce(
      initialUploadWorkflowState,
      { type: 'format-selected', format: 'geojson' },
      { type: 'occurrence-files-selected', files: [occurrence] },
      { type: 'predictor-files-selected', files: [predictor] }
    );
    const first = task('first', 'occurrence');
    const second = task('second');
    const uploading = uploadWorkflowReducer(selected, {
      type: 'tasks-added',
      tasks: [first, second],
      clearSelection: true,
    });

    expect(uploading.phase).toBe('uploading');
    expect(uploading.occurrenceFiles).toEqual([]);
    expect(uploading.predictorFiles).toEqual([]);
    expect(uploading.taskIds).toEqual(['first', 'second']);
    expect(selectUploadTasks(uploading)).toEqual([first, second]);
    expect(hasUnresolvedUploadTasks(uploading)).toBe(true);
  });

  it('updates only the affected parallel task and ignores stale progress', () => {
    const first = task('first');
    const second = task('second');
    const batch = reduce(initialUploadWorkflowState, {
      type: 'tasks-added',
      tasks: [first, second],
      clearSelection: false,
    });
    const started = reduce(
      batch,
      { type: 'task-started', taskId: 'first' },
      { type: 'task-progressed', taskId: 'first', progress: 38.4 },
      { type: 'task-progressed', taskId: 'second', progress: 90 }
    );

    expect(started.tasksById.first?.progress).toBe(38);
    expect(started.tasksById.second).toBe(second);
    const completed = uploadWorkflowReducer(started, {
      type: 'task-completed',
      taskId: 'first',
      datasetId: 'ds_11111111111111111111111111111111',
    });
    expect(
      uploadWorkflowReducer(completed, {
        type: 'task-progressed',
        taskId: 'first',
        progress: 20,
      })
    ).toBe(completed);
  });

  it('models pause, retry, failure recovery, and workflow stages', () => {
    const queued = reduce(initialUploadWorkflowState, {
      type: 'tasks-added',
      tasks: [task('first')],
      clearSelection: false,
    });
    const paused = reduce(
      queued,
      { type: 'task-started', taskId: 'first' },
      { type: 'task-paused', taskId: 'first', message: 'Paused.' },
      { type: 'batch-settled' }
    );
    expect(paused.phase).toBe('failed');
    expect(paused.tasksById.first?.status).toBe('paused');

    const recovered = reduce(
      paused,
      { type: 'task-started', taskId: 'first' },
      {
        type: 'task-completed',
        taskId: 'first',
        datasetId: 'ds_11111111111111111111111111111111',
      },
      { type: 'completion-started' },
      { type: 'profiling-started' },
      { type: 'redirect-started', message: 'Opening Validation…' }
    );
    expect(recovered.phase).toBe('redirecting');
    expect(recovered.tasksById.first?.status).toBe('complete');
    expect(hasUnresolvedUploadTasks(recovered)).toBe(false);
    expect(uploadWorkflowProgress(recovered)).toBe(100);
  });

  it('refuses duplicate example starts and preserves task state on unknown IDs', () => {
    const loading = uploadWorkflowReducer(initialUploadWorkflowState, {
      type: 'example-loading',
    });
    expect(uploadWorkflowReducer(loading, { type: 'example-loading' })).toBe(loading);
    expect(
      uploadWorkflowReducer(loading, {
        type: 'task-failed',
        taskId: 'missing',
        message: 'No task.',
      })
    ).toBe(loading);
  });
});
