'use client';

import * as Primitive from '@radix-ui/react-tabs';
import type React from 'react';
import { cn } from '../lib/cn';

export const Tabs = Primitive.Root;
export const TabsList: React.FC<React.ComponentProps<typeof Primitive.List>> = ({
  className,
  ref,
  ...props
}) => (
  <Primitive.List
    ref={ref}
    className={cn('flex min-h-10 gap-1 border-b border-border', className)}
    {...props}
  />
);
export const TabsTrigger: React.FC<React.ComponentProps<typeof Primitive.Trigger>> = ({
  className,
  ref,
  ...props
}) => (
  <Primitive.Trigger
    ref={ref}
    className={cn(
      'min-h-10 border-b-2 border-transparent px-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=active]:border-primary data-[state=active]:text-foreground',
      className
    )}
    {...props}
  />
);
export const TabsContent = Primitive.Content;
