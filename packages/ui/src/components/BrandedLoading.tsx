import type React from 'react';
import { cn } from '../lib/cn';
import { AnimatedBrandMark } from './AnimatedBrandMark';

type BrandedLoadingProps = React.ComponentPropsWithoutRef<'div'> & {
  description?: string;
  label: string;
  layout?: 'compact' | 'full-page';
};

export const BrandedLoading: React.FC<BrandedLoadingProps> = ({
  className,
  description,
  label,
  layout = 'compact',
  ...props
}) => {
  return (
    <div
      aria-live="polite"
      className={cn(
        'flex w-full items-center justify-center text-center',
        layout === 'full-page' ? 'min-h-[calc(100vh-var(--header-height))] px-6 py-16' : 'py-12',
        className
      )}
      role="status"
      {...props}
    >
      <div className="flex max-w-sm flex-col items-center">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-panel">
          <AnimatedBrandMark className="size-11" />
        </span>
        <p className="mt-5 text-sm font-semibold text-foreground">{label}</p>
        {description ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </div>
  );
};
