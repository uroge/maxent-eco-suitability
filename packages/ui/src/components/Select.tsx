'use client';

import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import type React from 'react';
import { cn } from '../lib/cn';

export const Select = Primitive.Root;

export const SelectValue = Primitive.Value;

export const SelectTrigger: React.FC<React.ComponentProps<typeof Primitive.Trigger>> = ({
  className,
  children,
  ref,
  ...props
}) => (
  <Primitive.Trigger
    ref={ref}
    className={cn(
      'flex min-h-10 w-full items-center justify-between rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:bg-disabled',
      className
    )}
    {...props}
  >
    {children}
    <Primitive.Icon>
      <ChevronDown size={16} />
    </Primitive.Icon>
  </Primitive.Trigger>
);

export const SelectContent: React.FC<React.ComponentProps<typeof Primitive.Content>> = ({
  className,
  children,
  ...props
}) => (
  <Primitive.Portal>
    <Primitive.Content
      className={cn(
        'z-dropdown overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-overlay',
        className
      )}
      {...props}
    >
      <Primitive.Viewport>{children}</Primitive.Viewport>
    </Primitive.Content>
  </Primitive.Portal>
);

export const SelectItem: React.FC<React.ComponentProps<typeof Primitive.Item>> = ({
  className,
  children,
  ref,
  ...props
}) => (
  <Primitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-10 cursor-default items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:text-disabled-foreground',
      className
    )}
    {...props}
  >
    <span className="absolute left-2">
      <Primitive.ItemIndicator>
        <Check size={14} />
      </Primitive.ItemIndicator>
    </span>
    <Primitive.ItemText>{children}</Primitive.ItemText>
  </Primitive.Item>
);
