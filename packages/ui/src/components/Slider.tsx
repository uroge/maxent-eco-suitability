'use client';

import * as Primitive from '@radix-ui/react-slider';
import type React from 'react';
import { cn } from '../lib/cn';

export const Slider: React.FC<React.ComponentProps<typeof Primitive.Root>> = ({
  className,
  ref,
  ...props
}) => (
  <Primitive.Root
    ref={ref}
    className={cn('relative flex h-10 w-full touch-none select-none items-center', className)}
    {...props}
  >
    <Primitive.Track className="relative h-1.5 grow rounded-full bg-muted">
      <Primitive.Range className="absolute h-full rounded-full bg-primary" />
    </Primitive.Track>
    <Primitive.Thumb className="block size-5 rounded-full border-2 border-primary bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus" />
  </Primitive.Root>
);
