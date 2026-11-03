import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTaskProgressThrottle } from './task-progress-throttle';

afterEach(() => {
  vi.useRealTimers();
});

describe('createTaskProgressThrottle', () => {
  it('emits at most once per 100ms for each task and keeps task schedules independent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sink = vi.fn();
    const throttle = createTaskProgressThrottle(sink);

    throttle.report('first', 1);
    throttle.report('first', 2);
    throttle.report('first', 3);
    throttle.report('second', 10);
    expect(sink.mock.calls).toEqual([
      ['first', 1],
      ['second', 10],
    ]);

    vi.advanceTimersByTime(99);
    expect(sink).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(sink).toHaveBeenLastCalledWith('first', 3);
  });

  it('flushes the latest value immediately for completion and cleanup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const sink = vi.fn();
    const throttle = createTaskProgressThrottle(sink);

    throttle.report('first', 20);
    throttle.report('first', 75);
    throttle.flush('first');
    expect(sink).toHaveBeenLastCalledWith('first', 75);

    throttle.report('first', 90);
    throttle.report('second', 30);
    throttle.report('second', 60);
    throttle.flushAll();
    expect(sink).toHaveBeenCalledWith('first', 90);
    expect(sink).toHaveBeenCalledWith('second', 60);
    expect(vi.getTimerCount()).toBe(0);
  });
});
