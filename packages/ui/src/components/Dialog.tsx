'use client';

import * as Primitive from '@radix-ui/react-dialog';
import type React from 'react';
import { cn } from '../lib/cn';

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogContent: React.FC<React.ComponentProps<typeof Primitive.Content>> = ({
  className,
  children,
  ref,
  ...props
}) => (
  <Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-overlay bg-[var(--overlay)]" />
    <Primitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-modal max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-border bg-surface p-6 shadow-overlay outline-none',
        className
      )}
      {...props}
    >
      {children}
    </Primitive.Content>
  </Primitive.Portal>
);

export const SheetContent: React.FC<React.ComponentProps<typeof Primitive.Content>> = ({
  className,
  children,
  ref,
  ...props
}) => (
  <Primitive.Portal>
    <Primitive.Overlay className="fixed inset-0 z-overlay bg-[var(--overlay)]" />
    <Primitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 right-0 z-modal w-[min(90vw,24rem)] overflow-auto border-l border-border bg-surface p-5 shadow-overlay outline-none',
        className
      )}
      {...props}
    >
      {children}
    </Primitive.Content>
  </Primitive.Portal>
);
