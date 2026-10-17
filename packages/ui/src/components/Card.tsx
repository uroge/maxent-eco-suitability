import type React from 'react';
import { cn } from '../lib/cn';

type CardProps = React.ComponentPropsWithoutRef<'section'>;

export const Card: React.FC<CardProps> = ({ className, ...props }) => {
  return (
    <section
      className={cn('rounded-lg border border-border bg-surface shadow-card', className)}
      {...props}
    />
  );
};
