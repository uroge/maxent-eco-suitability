import type React from 'react';
import { cn } from '../lib/cn';

type SectionHeadingProps = React.ComponentPropsWithoutRef<'h2'> & {
  eyebrow?: string;
};

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  children,
  className,
  eyebrow,
  ...props
}) => {
  return (
    <div>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          'text-2xl font-semibold tracking-tight text-foreground sm:text-3xl',
          className
        )}
        {...props}
      >
        {children}
      </h2>
    </div>
  );
};
