import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn } from '../lib/cn';

const variants = cva('rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      information: 'border-information-border bg-information-surface text-foreground',
      success: 'border-success-border bg-success-surface text-foreground',
      warning: 'border-warning-border bg-warning-surface text-foreground',
      destructive: 'border-destructive-border bg-destructive-surface text-foreground',
    },
  },
  defaultVariants: { variant: 'information' },
});

type AlertProps = React.ComponentProps<'div'> & VariantProps<typeof variants>;

export const Alert: React.FC<AlertProps> = ({ className, variant, ...props }) => (
  <div className={cn(variants({ variant }), className)} role="status" {...props} />
);
