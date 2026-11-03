import type React from 'react';
import { cn } from '../lib/cn';
import { BrandMark } from './BrandMark';

interface BrandLockupProps extends React.ComponentPropsWithoutRef<'div'> {
  descriptor?: string;
  tone?: 'default' | 'inverse';
}

export const BrandLockup: React.FC<BrandLockupProps> = ({
  className,
  descriptor,
  tone = 'default',
  ...props
}) => {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)} {...props}>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-lg',
          tone === 'inverse'
            ? 'bg-inverse-foreground text-hero'
            : 'bg-primary text-primary-foreground'
        )}
      >
        <BrandMark className="size-6" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate text-sm font-semibold leading-none tracking-tight',
            tone === 'inverse' ? 'text-inverse-foreground' : 'text-foreground'
          )}
        >
          EcoSuitability
        </span>
        {descriptor ? (
          <span
            className={cn(
              'mt-1 block truncate text-xs leading-none',
              tone === 'inverse' ? 'text-inverse-muted' : 'text-muted-foreground'
            )}
          >
            {descriptor}
          </span>
        ) : null}
      </span>
    </div>
  );
};
