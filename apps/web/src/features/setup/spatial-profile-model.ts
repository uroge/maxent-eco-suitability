import type { AnalysisInputProfile } from '@ecosuitability/contracts';

export type SpatialBounds = [number, number, number, number];

export type SpatialPoint = [number, number];

type PredictorExtent = {
  bounds: SpatialBounds;
  datasetIds: string[];
};

export type SpatialProfileModel = {
  crsLabel: string;
  crsValues: string[];
  domain?: SpatialBounds;
  hiddenExtentCount: number;
  invalidFeatureCount: number;
  message?: string;
  overlapCount?: number;
  overlapPercent?: number;
  points: SpatialPoint[];
  predictorCount: number;
  predictorExtents: PredictorExtent[];
  previewPointCount: number;
  recordCount: number | null;
  sharedExtent?: SpatialBounds;
  state: 'ready' | 'occurrences-only' | 'predictors-only' | 'empty' | 'error' | 'crs-mismatch';
};

type PreviewFeature = {
  geometry?: {
    coordinates?: unknown;
    type?: unknown;
  };
};

const maximumRenderedExtents = 8;

const normalizeCrs = (value: string): string => value.trim().replace(/\s+/g, ' ').toUpperCase();

const validBounds = (value: readonly number[]): value is SpatialBounds =>
  value.length === 4 &&
  value.every(Number.isFinite) &&
  value[0]! < value[2]! &&
  value[1]! < value[3]!;

const extractPoints = (
  preview: AnalysisInputProfile['spatialPreview']
): { invalidFeatureCount: number; points: SpatialPoint[] } => {
  if (!preview) {
    return { invalidFeatureCount: 0, points: [] };
  }

  const points: SpatialPoint[] = [];
  let invalidFeatureCount = 0;
  for (const feature of preview.features) {
    const candidate = feature as PreviewFeature;
    const coordinates = candidate.geometry?.coordinates;
    if (
      candidate.geometry?.type === 'Point' &&
      Array.isArray(coordinates) &&
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number' &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1])
    ) {
      points.push([coordinates[0], coordinates[1]]);
    } else {
      invalidFeatureCount += 1;
    }
  }
  return { invalidFeatureCount, points };
};

const deduplicateExtents = (profile: AnalysisInputProfile): PredictorExtent[] => {
  const extents = new Map<string, PredictorExtent>();
  for (const raster of profile.rasters) {
    if (!validBounds(raster.bounds)) {
      continue;
    }
    const key = raster.bounds.join(':');
    const existing = extents.get(key);
    if (existing) {
      existing.datasetIds.push(raster.datasetId);
    } else {
      extents.set(key, { bounds: [...raster.bounds], datasetIds: [raster.datasetId] });
    }
  }
  return [...extents.values()].sort((left, right) =>
    left.datasetIds[0]!.localeCompare(right.datasetIds[0]!)
  );
};

const intersectBounds = (extents: PredictorExtent[]): SpatialBounds | undefined => {
  if (!extents.length) {
    return undefined;
  }
  const intersection: SpatialBounds = [...extents[0]!.bounds];
  for (const extent of extents.slice(1)) {
    intersection[0] = Math.max(intersection[0], extent.bounds[0]);
    intersection[1] = Math.max(intersection[1], extent.bounds[1]);
    intersection[2] = Math.min(intersection[2], extent.bounds[2]);
    intersection[3] = Math.min(intersection[3], extent.bounds[3]);
  }
  return validBounds(intersection) ? intersection : undefined;
};

const unionDomain = (
  points: SpatialPoint[],
  extents: PredictorExtent[]
): SpatialBounds | undefined => {
  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  for (const { bounds } of extents) {
    xValues.push(bounds[0], bounds[2]);
    yValues.push(bounds[1], bounds[3]);
  }
  if (!xValues.length || !yValues.length) {
    return undefined;
  }
  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumY = Math.max(...yValues);
  const xSpan = maximumX - minimumX;
  const ySpan = maximumY - minimumY;
  const xPadding = xSpan > 0 ? xSpan * 0.08 : Math.max(Math.abs(minimumX) * 0.02, 1);
  const yPadding = ySpan > 0 ? ySpan * 0.08 : Math.max(Math.abs(minimumY) * 0.02, 1);
  return [minimumX - xPadding, minimumY - yPadding, maximumX + xPadding, maximumY + yPadding];
};

const pointInBounds = ([x, y]: SpatialPoint, bounds: SpatialBounds): boolean =>
  x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];

export const buildSpatialProfileModel = (profile: AnalysisInputProfile): SpatialProfileModel => {
  const { invalidFeatureCount, points } = extractPoints(profile.spatialPreview);
  const allExtents = deduplicateExtents(profile);
  const occurrenceCrs = profile.occurrence.crs ? normalizeCrs(profile.occurrence.crs) : undefined;
  const predictorCrsValues = [
    ...new Set(profile.rasters.map((raster) => normalizeCrs(raster.crs))),
  ];
  const crsValues = [
    ...new Set([...(occurrenceCrs ? [occurrenceCrs] : []), ...predictorCrsValues]),
  ];
  const base = {
    crsLabel:
      crsValues.length === 1 ? crsValues[0]! : crsValues.length ? 'Multiple CRS' : 'Unknown',
    crsValues,
    hiddenExtentCount: Math.max(0, allExtents.length - maximumRenderedExtents),
    invalidFeatureCount,
    points,
    predictorCount: profile.rasters.length,
    predictorExtents: allExtents.slice(0, maximumRenderedExtents),
    previewPointCount: points.length,
    recordCount: profile.occurrence.recordCount,
  };

  if (profile.status === 'failed') {
    return {
      ...base,
      message: 'Spatial profiling failed before a trustworthy preview could be prepared.',
      state: 'error',
    };
  }
  if (profile.spatialPreview?.features.length && !points.length) {
    return {
      ...base,
      message: 'The spatial preview contains no valid finite point geometries.',
      state: 'error',
    };
  }
  const hasComparableData = points.length > 0 && allExtents.length > 0;
  const crsMismatch =
    predictorCrsValues.length > 1 ||
    (hasComparableData && (!occurrenceCrs || predictorCrsValues[0] !== occurrenceCrs));
  if (crsMismatch) {
    return {
      ...base,
      message:
        'Occurrence and predictor coordinates use incompatible CRS values and cannot be overlaid safely.',
      state: 'crs-mismatch',
    };
  }

  const sharedExtent = intersectBounds(allExtents);
  const domain = unionDomain(points, allExtents);
  const overlapCount = sharedExtent
    ? points.filter((point) => pointInBounds(point, sharedExtent)).length
    : undefined;
  const overlapPercent =
    overlapCount === undefined || !points.length ? undefined : (overlapCount / points.length) * 100;

  if (!points.length && !allExtents.length) {
    return { ...base, state: 'empty' };
  }
  if (!allExtents.length) {
    return {
      ...base,
      domain,
      message: 'Predictor coverage is unavailable; showing the occurrence distribution only.',
      state: 'occurrences-only',
    };
  }
  if (!points.length) {
    return {
      ...base,
      domain,
      message: 'Coordinate mapping is pending; showing predictor extents only.',
      sharedExtent,
      state: 'predictors-only',
    };
  }
  return {
    ...base,
    domain,
    overlapCount,
    overlapPercent,
    sharedExtent,
    state: 'ready',
  };
};
