import { useId } from 'react';
import type { AnalysisInputProfile } from '@ecosuitability/contracts';
import { Alert, EmptyState } from '@ecosuitability/ui';
import {
  buildSpatialProfileModel,
  type SpatialBounds,
  type SpatialPoint,
} from './spatial-profile-model';

type SpatialProfilePreviewProps = {
  profile: AnalysisInputProfile;
};

const viewport = { height: 280, padding: 24, width: 480 } as const;

const extentColors = [
  '--series-temperature',
  '--series-precipitation',
  '--series-elevation',
  '--series-forest-cover',
  '--information',
  '--success',
  '--warning',
  '--primary',
] as const;

const projectPoint = ([x, y]: SpatialPoint, domain: SpatialBounds): SpatialPoint => {
  const drawingWidth = viewport.width - viewport.padding * 2;
  const drawingHeight = viewport.height - viewport.padding * 2;
  return [
    viewport.padding + ((x - domain[0]) / (domain[2] - domain[0])) * drawingWidth,
    viewport.padding + ((domain[3] - y) / (domain[3] - domain[1])) * drawingHeight,
  ];
};

const projectBounds = (bounds: SpatialBounds, domain: SpatialBounds) => {
  const [left, bottom] = projectPoint([bounds[0], bounds[1]], domain);
  const [right, top] = projectPoint([bounds[2], bounds[3]], domain);
  return { height: bottom - top, width: right - left, x: left, y: top };
};

const percentage = (value?: number): string =>
  value === undefined ? 'Unavailable' : `${Math.round(value)}% of preview points`;

export const SpatialProfilePreview: React.FC<SpatialProfilePreviewProps> = ({ profile }) => {
  const patternId = `spatial-overlap-${useId().replace(/:/g, '')}`;
  const model = buildSpatialProfileModel(profile);
  const domain = model.domain;

  if (model.state === 'error') {
    return <Alert variant="destructive">{model.message}</Alert>;
  }
  if (model.state === 'crs-mismatch') {
    return (
      <Alert variant="warning">
        <strong>CRS values cannot be compared.</strong> {model.message}{' '}
        <span className="font-mono text-xs">{model.crsValues.join(' · ')}</span>
      </Alert>
    );
  }
  if (model.state === 'empty' || !domain) {
    return (
      <EmptyState
        description="Confirm an unambiguous coordinate mapping or provide predictor rasters to generate a spatial profile."
        title="Spatial preview unavailable"
      />
    );
  }

  return (
    <div className="space-y-4" data-spatial-profile-state={model.state}>
      <svg
        aria-describedby={`${patternId}-description`}
        aria-labelledby={`${patternId}-title`}
        className="h-auto w-full overflow-visible rounded-lg border border-border bg-surface-subtle"
        role="img"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      >
        <title id={`${patternId}-title`}>Occurrence and predictor spatial profile</title>
        <desc id={`${patternId}-description`}>
          {model.previewPointCount} preview points and {model.predictorCount} predictor rasters in{' '}
          {model.crsLabel}.
        </desc>
        <defs>
          <pattern height="10" id={patternId} patternUnits="userSpaceOnUse" width="10">
            <path
              d="M-2 2 2-2M0 10 10 0M8 12 12 8"
              stroke="var(--primary)"
              strokeOpacity="0.5"
              strokeWidth="1"
            />
          </pattern>
          <pattern height="28" id={`${patternId}-grid`} patternUnits="userSpaceOnUse" width="28">
            <path d="M28 0H0v28" fill="none" stroke="var(--border)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect fill={`url(#${patternId}-grid)`} height="100%" width="100%" />
        {model.predictorExtents.map((extent, index) => {
          const projected = projectBounds(extent.bounds, domain);
          return (
            <rect
              data-predictor-extent={extent.datasetIds.join(',')}
              fill={`var(${extentColors[index % extentColors.length]})`}
              fillOpacity="0.08"
              height={projected.height}
              key={extent.bounds.join(':')}
              stroke={`var(${extentColors[index % extentColors.length]})`}
              strokeOpacity="0.85"
              strokeWidth="1.5"
              width={projected.width}
              x={projected.x}
              y={projected.y}
            />
          );
        })}
        {model.sharedExtent
          ? (() => {
              const projected = projectBounds(model.sharedExtent, domain);
              return (
                <rect
                  data-shared-coverage="true"
                  fill={`url(#${patternId})`}
                  height={projected.height}
                  stroke="var(--primary)"
                  strokeDasharray="5 4"
                  strokeWidth="1.5"
                  width={projected.width}
                  x={projected.x}
                  y={projected.y}
                />
              );
            })()
          : null}
        {model.points.map((point, index) => {
          const [x, y] = projectPoint(point, domain);
          return (
            <g data-occurrence-point="true" key={`${point.join(':')}:${index}`}>
              <circle
                cx={x}
                cy={y}
                fill="var(--surface)"
                r="4.5"
                stroke="var(--foreground)"
                strokeOpacity="0.5"
              />
              <circle cx={x} cy={y} fill="var(--suitability-4)" r="2.5" />
            </g>
          );
        })}
      </svg>

      {model.message ? <p className="text-sm text-muted-foreground">{model.message}</p> : null}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">Occurrence records</dt>
          <dd className="mt-1 font-mono">{model.recordCount ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Previewed points</dt>
          <dd className="mt-1 font-mono">{model.previewPointCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Predictors</dt>
          <dd className="mt-1 font-mono">{model.predictorCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">CRS</dt>
          <dd className="mt-1 truncate font-mono text-xs" title={model.crsLabel}>
            {model.crsLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Shared coverage</dt>
          <dd className="mt-1 font-mono text-xs">{percentage(model.overlapPercent)}</dd>
        </div>
      </dl>
      {model.hiddenExtentCount ? (
        <p className="text-xs text-muted-foreground">
          {model.hiddenExtentCount} additional distinct predictor extent
          {model.hiddenExtentCount === 1 ? '' : 's'} included in overlap calculations.
        </p>
      ) : null}
      {model.invalidFeatureCount ? (
        <p className="text-xs text-warning">
          {model.invalidFeatureCount} malformed preview feature
          {model.invalidFeatureCount === 1 ? ' was' : 's were'} omitted.
        </p>
      ) : null}
    </div>
  );
};
