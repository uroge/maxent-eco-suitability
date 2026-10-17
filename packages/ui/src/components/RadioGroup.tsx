'use client';

import * as Primitive from '@radix-ui/react-radio-group';
import type React from 'react';
import { cn } from '../lib/cn';

export const RadioGroup = Primitive.Root;

export const RadioGroupItem: React.FC<React.ComponentProps<typeof Primitive.Item>> = ({
  className,
  ref,
  ...props
}) => (
  <Primitive.Item
    ref={ref}
    className={cn(
      'flex size-5 items-center justify-center rounded-full border border-border-strong bg-surface outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=checked]:border-primary disabled:bg-disabled',
      className
    )}
    {...props}
  >
    <Primitive.Indicator className="size-2.5 rounded-full bg-primary" />
  </Primitive.Item>
);
