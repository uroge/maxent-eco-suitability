import { memo } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadTask } from './upload-workflow-machine';

const renders = vi.hoisted(() => new Map<string, number>());

vi.mock('./UploadTaskRow', () => ({
  UploadTaskRow: memo(function MockUploadTaskRow({ task }: { task: UploadTask }) {
    renders.set(task.key, (renders.get(task.key) ?? 0) + 1);
    return <li>{task.progress}</li>;
  }),
}));

import { UploadTasksPanel } from './UploadTasksPanel';

const task = (key: string): UploadTask => ({
  files: [new File(['raster'], `${key}.tif`)],
  format: 'geotiff',
  key,
  kind: 'predictor',
  progress: 0,
  resume: { completedParts: new Map() },
  status: 'uploading',
});

describe('UploadTasksPanel rendering', () => {
  beforeEach(() => {
    renders.clear();
  });

  it('does not rerender an unaffected memoized task row', () => {
    const first = task('first');
    const second = task('second');
    const onPause = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(
      <UploadTasksPanel tasks={[first, second]} onPause={onPause} onRetry={onRetry} />
    );

    rerender(
      <UploadTasksPanel
        tasks={[first, { ...second, progress: 50 }]}
        onPause={onPause}
        onRetry={onRetry}
      />
    );

    expect(renders.get('first')).toBe(1);
    expect(renders.get('second')).toBe(2);
  });
});
