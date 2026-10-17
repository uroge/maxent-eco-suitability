import type React from 'react';
import { cn } from '../lib/cn';

export type InputProps = React.ComponentProps<'input'> & { invalid?: boolean };

export const Input: React.FC<InputProps> = ({ className, invalid, ref, ...props }) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'min-h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20',
      className
    )}
    {...props}
  />
);
