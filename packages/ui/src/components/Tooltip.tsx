'use client';

import * as Primitive from '@radix-ui/react-tooltip';
import type React from 'react';
import { cn } from '../lib/cn';

export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export const TooltipContent: React.FC<React.ComponentProps<typeof Primitive.Content>> = ({
  className,
  sideOffset = 6,
  ...props
}) => (
  <Primitive.Portal>
    <Primitive.Content
      sideOffset={sideOffset}
      className={cn(
        'z-overlay rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-overlay',
        className
      )}
      {...props}
    />
  </Primitive.Portal>
);
