import type React from 'react';
import { cn } from '../lib/cn';

type ProgressProps = React.ComponentProps<'div'> & { value: number };

export const Progress: React.FC<ProgressProps> = ({ className, value, ...props }) => {
  const bounded = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bounded}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
};
