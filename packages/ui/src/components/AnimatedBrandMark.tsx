import type React from 'react';
import { brandContourPaths, brandPoint, brandViewBox } from './brand-geometry';
import { cn } from '../lib/cn';

interface AnimatedBrandMarkProps extends React.ComponentPropsWithoutRef<'svg'> {
  title?: string;
}

export const AnimatedBrandMark: React.FC<AnimatedBrandMarkProps> = ({
  className,
  title,
  ...props
}) => {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('brand-mark-animated', className)}
      fill="none"
      role={title ? 'img' : undefined}
      viewBox={brandViewBox}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      >
        {brandContourPaths.map((path, index) => (
          <path
            className={`brand-mark-animated__contour brand-mark-animated__contour--${index + 1}`}
            d={path}
            key={path}
            pathLength="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
      <circle {...brandPoint} className="brand-mark-animated__point" fill="currentColor" />
    </svg>
  );
};
