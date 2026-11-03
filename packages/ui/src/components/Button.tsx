'use client';

import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:brightness-95',
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:bg-accent active:brightness-95',
        outline:
          'border border-border-strong bg-transparent text-foreground hover:bg-muted active:bg-accent',
        inverse:
          'border border-inverse-surface bg-inverse-surface text-hero hover:border-inverse-surface-hover hover:bg-inverse-surface-hover active:border-inverse-surface-active active:bg-inverse-surface-active focus-visible:ring-inverse-foreground focus-visible:ring-offset-hero disabled:border-inverse-disabled disabled:bg-inverse-disabled disabled:text-inverse-disabled-foreground',
        ghost: 'bg-transparent text-foreground hover:bg-muted active:bg-accent',
        destructive:
          'bg-destructive text-destructive-foreground hover:brightness-95 active:brightness-90',
      },
      size: {
        sm: 'min-h-10 px-3 text-sm',
        md: 'min-h-10 px-4 text-sm',
        lg: 'min-h-11 px-6 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type ButtonProps = React.ComponentPropsWithoutRef<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button: React.FC<ButtonProps> = ({
  asChild = false,
  children,
  className,
  disabled = false,
  loading = false,
  onClick,
  size,
  type,
  variant,
  ...props
}) => {
  const unavailable = disabled || loading;
  const content = (
    <>
      {loading ? (
        <span
          aria-hidden="true"
          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </>
  );
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot
        aria-busy={loading || undefined}
        aria-disabled={unavailable || undefined}
        className={classes}
        onClick={(event: React.MouseEvent<HTMLElement>) => {
          if (unavailable) {
            event.preventDefault();
            return;
          }

          onClick?.(event as React.MouseEvent<HTMLButtonElement>);
        }}
        tabIndex={unavailable ? -1 : undefined}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : null}
        <Slottable>{children}</Slottable>
      </Slot>
    );
  }

  return (
    <button
      aria-busy={loading || undefined}
      className={classes}
      disabled={unavailable}
      onClick={onClick}
      type={type ?? 'button'}
      {...props}
    >
      {content}
    </button>
  );
};
