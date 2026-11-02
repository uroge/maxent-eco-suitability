'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type React from 'react';
import { cn } from '../lib/cn';

export const Checkbox: React.FC<React.ComponentProps<typeof CheckboxPrimitive.Root>> = ({
  className,
  ref,
  ...props
}) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'flex size-5 shrink-0 items-center justify-center rounded border border-border-strong bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:bg-disabled data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator>
      <Check size={14} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);
