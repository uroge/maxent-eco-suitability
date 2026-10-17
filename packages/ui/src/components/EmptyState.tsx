import type React from 'react';
import { cn } from '../lib/cn';

type EmptyStateProps = React.ComponentProps<'section'> & {
  title: string;
  description: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  children,
  className,
  description,
  title,
  ...props
}) => (
  <section
    className={cn('rounded-xl border border-dashed border-border p-8 text-center', className)}
    {...props}
  >
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{description}</p>
    {children ? <div className="mt-5 flex justify-center">{children}</div> : null}
  </section>
);
