import type React from 'react';
import { brandContourPaths, brandPoint, brandViewBox } from './brand-geometry';

interface BrandMarkProps extends React.ComponentPropsWithoutRef<'svg'> {
  title?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ title, ...props }) => {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
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
        {brandContourPaths.map((path) => (
          <path d={path} key={path} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      <circle {...brandPoint} fill="currentColor" />
    </svg>
  );
};
