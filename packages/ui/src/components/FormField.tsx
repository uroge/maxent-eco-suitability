import type React from 'react';
import { cn } from '../lib/cn';

type FormFieldProps = React.ComponentProps<'div'> & {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string;
};

export const FormField: React.FC<FormFieldProps> = ({
  children,
  className,
  description,
  error,
  htmlFor,
  label,
  ...props
}) => (
  <div className={cn('space-y-2', className)} {...props}>
    <label className="block text-sm font-medium text-foreground" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {error ? <p className="text-sm text-destructive">{error}</p> : null}
    {!error && description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
  </div>
);
