'use client';

import { Card } from '@ecosuitability/ui';
import { UploadTaskRow } from './UploadTaskRow';
import type { UploadTask } from './upload-workflow-machine';

type UploadTasksPanelProps = {
  onPause: (taskId: string) => void;
  onRetry: (task: UploadTask) => void;
  tasks: UploadTask[];
};

export const UploadTasksPanel: React.FC<UploadTasksPanelProps> = ({ onPause, onRetry, tasks }) => {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="font-semibold">Upload progress</h2>
      <ul className="mt-3 space-y-4">
        {tasks.map((task) => (
          <UploadTaskRow key={task.key} onPause={onPause} onRetry={onRetry} task={task} />
        ))}
      </ul>
    </Card>
  );
};
