import type React from 'react';
import { cn } from '../lib/cn';

type PageContainerProps = React.ComponentPropsWithoutRef<'div'> & {
  width?: 'narrow' | 'default' | 'wide';
};

const widthClasses = {
  narrow: 'max-w-content-narrow',
  default: 'max-w-content',
  wide: 'max-w-content-wide',
};

export const PageContainer: React.FC<PageContainerProps> = ({
  className,
  width = 'default',
  ...props
}) => {
  return (
    <div
      className={cn('mx-auto w-full px-5 sm:px-8 lg:px-page', widthClasses[width], className)}
      {...props}
    />
  );
};
