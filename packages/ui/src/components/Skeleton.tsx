import type React from 'react';
import { cn } from '../lib/cn';

export const Skeleton: React.FC<React.ComponentProps<'div'>> = ({ className, ...props }) => (
  <div
    className={cn('animate-pulse rounded-md bg-muted', className)}
    aria-hidden="true"
    {...props}
  />
);
