import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted text-muted-foreground',
        success: 'border-success-border bg-success-surface text-success',
        warning: 'border-warning-border bg-warning-surface text-warning',
        error: 'border-destructive-border bg-destructive-surface text-destructive',
        information: 'border-information-border bg-information-surface text-information',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

type BadgeProps = React.ComponentPropsWithoutRef<'span'> & VariantProps<typeof badgeVariants>;

export const Badge: React.FC<BadgeProps> = ({ className, variant, ...props }) => {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
};
