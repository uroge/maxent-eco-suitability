import type React from 'react';
import { cn } from '../lib/cn';

type IconButtonProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & {
  children: React.ReactNode;
  label: string;
};

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  className,
  label,
  type = 'button',
  ...props
}) => {
  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:text-disabled-foreground',
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
};
