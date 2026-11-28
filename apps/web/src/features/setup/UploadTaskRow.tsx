'use client';

import { memo } from 'react';
import { Button, Progress } from '@ecosuitability/ui';
import { X } from 'lucide-react';
import type { UploadTask } from './upload-workflow-machine';

type UploadTaskRowProps = {
  onPause: (taskId: string) => void;
  onRetry: (task: UploadTask) => void;
  task: UploadTask;
};

const UploadTaskRowComponent: React.FC<UploadTaskRowProps> = ({ onPause, onRetry, task }) => (
  <li>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>
        {task.replaceDatasetId ? 'Replacement · ' : ''}
        {task.files.map((file) => file.name).join(', ')}
      </span>
      <span className="capitalize text-muted-foreground">
        {task.status} · {task.progress}%
      </span>
    </div>
    <Progress value={task.progress} />
    {task.message ? <p className="mt-1 text-xs text-destructive">{task.message}</p> : null}
    <div className="mt-2 flex gap-2">
      {task.status === 'uploading' ? (
        <Button size="sm" variant="secondary" onClick={() => onPause(task.key)}>
          <X size={15} />
          Pause
        </Button>
      ) : null}
      {task.status === 'failed' || task.status === 'paused' ? (
        <Button size="sm" variant="secondary" onClick={() => onRetry(task)}>
          Retry
        </Button>
      ) : null}
    </div>
  </li>
);

export const UploadTaskRow = memo(UploadTaskRowComponent);
