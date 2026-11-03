type ProgressSink = (taskId: string, progress: number) => void;

type PendingProgress = {
  lastEmittedAt?: number;
  latest?: number;
  timer?: ReturnType<typeof setTimeout>;
};

export type TaskProgressThrottle = {
  flush: (taskId: string) => void;
  flushAll: () => void;
  report: (taskId: string, progress: number) => void;
};

export const createTaskProgressThrottle = (
  sink: ProgressSink,
  intervalMilliseconds = 100
): TaskProgressThrottle => {
  const pending = new Map<string, PendingProgress>();

  const emit = (taskId: string, entry: PendingProgress, progress: number): void => {
    entry.latest = undefined;
    entry.lastEmittedAt = Date.now();
    sink(taskId, progress);
  };

  const flush = (taskId: string): void => {
    const entry = pending.get(taskId);
    if (!entry) {
      return;
    }
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    if (entry.latest !== undefined) {
      emit(taskId, entry, entry.latest);
    }
  };

  const report = (taskId: string, progress: number): void => {
    const entry = pending.get(taskId) ?? {};
    pending.set(taskId, entry);
    const elapsed = entry.lastEmittedAt === undefined ? Infinity : Date.now() - entry.lastEmittedAt;
    if (elapsed >= intervalMilliseconds && !entry.timer) {
      emit(taskId, entry, progress);
      return;
    }
    entry.latest = progress;
    if (!entry.timer) {
      entry.timer = setTimeout(
        () => {
          entry.timer = undefined;
          if (entry.latest !== undefined) {
            emit(taskId, entry, entry.latest);
          }
        },
        Math.max(0, intervalMilliseconds - elapsed)
      );
    }
  };

  return {
    flush,
    flushAll: () => {
      for (const taskId of pending.keys()) {
        flush(taskId);
      }
      pending.clear();
    },
    report,
  };
};
