import { render, screen } from '@testing-library/react';
import type { AnalysisInputProfile, RasterMetadata } from '@ecosuitability/contracts';
import { describe, expect, it } from 'vitest';
import { SpatialProfilePreview } from './SpatialProfilePreview';
import { buildSpatialProfileModel } from './spatial-profile-model';

const raster = (
  datasetId: string,
  bounds: [number, number, number, number],
  crs = 'EPSG:4326'
): RasterMetadata => ({
  alignedToReference: true,
  bandCount: 1,
  bounds,
  crs,
  datasetId,
  height: 100,
  nodata: null,
  resolution: [0.1, 0.1],
  width: 100,
});

const point = (x: number, y: number): unknown => ({
  geometry: { coordinates: [x, y], type: 'Point' },
  properties: {},
  type: 'Feature',
});

const profile = (
  overrides: Partial<
    Pick<AnalysisInputProfile, 'occurrence' | 'rasters' | 'spatialPreview' | 'status'>
  > = {}
): AnalysisInputProfile => ({
  analysisId: 'an_0123456789abcdef0123456789abcdef',
  blockers: [],
  checks: [],
  completedAt: '2026-11-03T10:00:00.000Z',
  createdAt: '2026-11-03T09:59:00.000Z',
  inputFingerprint: `jcs-sha256-v1:${'a'.repeat(64)}`,
  inputRevision: 1,
  occurrence: {
    columns: ['longitude', 'latitude'],
    crs: 'epsg:4326',
    duplicateCoordinateCount: 0,
    latitudeCandidates: ['latitude'],
    layers: [],
    longitudeCandidates: ['longitude'],
    recordCount: 240,
    sources: [],
    speciesCandidates: ['species'],
  },
  policyVersion: '2026-10-01',
  progress: 100,
  rasters: [
    raster('ds_11111111111111111111111111111111', [0, 0, 10, 10]),
    raster('ds_22222222222222222222222222222222', [0, 0, 10, 10]),
    raster('ds_33333333333333333333333333333333', [2, 2, 8, 8]),
  ],
  spatialPreview: {
    features: [point(3, 3), point(7, 7), point(9, 9)],
    type: 'FeatureCollection',
  },
  status: 'passed',
  warnings: [],
  ...overrides,
});

describe('buildSpatialProfileModel', () => {
  it('deduplicates extents and calculates sampled shared coverage', () => {
    const model = buildSpatialProfileModel(profile());

    expect(model.state).toBe('ready');
    expect(model.predictorCount).toBe(3);
    expect(model.predictorExtents).toHaveLength(2);
    expect(model.sharedExtent).toEqual([2, 2, 8, 8]);
    expect(model.overlapCount).toBe(2);
    expect(model.overlapPercent).toBeCloseTo(66.67, 1);
    expect(model.crsLabel).toBe('EPSG:4326');
  });

  it('limits rendered extents while preserving all extents in the model calculation', () => {
    const rasters = Array.from({ length: 10 }, (_, index) =>
      raster(`ds_${String(index + 1).padStart(32, '0')}`, [index, index, 20 - index / 2, 20])
    );
    const model = buildSpatialProfileModel(profile({ rasters }));

    expect(model.predictorExtents).toHaveLength(8);
    expect(model.hiddenExtentCount).toBe(2);
  });

  it('distinguishes occurrence-only, predictor-only, and empty profiles', () => {
    expect(buildSpatialProfileModel(profile({ rasters: [] })).state).toBe('occurrences-only');
    expect(buildSpatialProfileModel(profile({ spatialPreview: null })).state).toBe(
      'predictors-only'
    );
    expect(buildSpatialProfileModel(profile({ rasters: [], spatialPreview: null })).state).toBe(
      'empty'
    );
  });

  it('creates a non-degenerate domain for a single valid point', () => {
    const model = buildSpatialProfileModel(
      profile({
        rasters: [],
        spatialPreview: { type: 'FeatureCollection', features: [point(4, 4)] },
      })
    );

    expect(model.domain?.[0]).toBeLessThan(4);
    expect(model.domain?.[2]).toBeGreaterThan(4);
  });

  it('reports malformed geometry and failed profiling as recoverable errors', () => {
    const malformed = profile({
      spatialPreview: {
        features: [{ geometry: { coordinates: ['bad', 2], type: 'Point' } }],
        type: 'FeatureCollection',
      },
    });

    expect(buildSpatialProfileModel(malformed).state).toBe('error');
    expect(buildSpatialProfileModel(profile({ status: 'failed' })).state).toBe('error');
  });

  it('refuses to overlay occurrence and predictor coordinates with different CRS values', () => {
    const model = buildSpatialProfileModel(
      profile({
        rasters: [raster('ds_11111111111111111111111111111111', [0, 0, 10, 10], 'EPSG:3857')],
      })
    );

    expect(model.state).toBe('crs-mismatch');
    expect(model.crsValues).toEqual(['EPSG:4326', 'EPSG:3857']);
    expect(model.overlapPercent).toBeUndefined();
  });
});

describe('SpatialProfilePreview', () => {
  it('renders an accessible combined SVG and truthful profile metadata', () => {
    const { container } = render(<SpatialProfilePreview profile={profile()} />);

    expect(
      screen.getByRole('img', { name: 'Occurrence and predictor spatial profile' })
    ).toBeDefined();
    expect(screen.getByText('240')).toBeDefined();
    expect(screen.getAllByText('3', { selector: 'dd' })).toHaveLength(2);
    expect(screen.getByText('67% of preview points')).toBeDefined();
    expect(container.querySelectorAll('[data-predictor-extent]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-occurrence-point]')).toHaveLength(3);
    expect(container.querySelector('[data-shared-coverage="true"]')).not.toBeNull();
  });

  it('renders explicit mismatch, empty, and malformed-data states', () => {
    const mismatch = profile({
      rasters: [raster('ds_11111111111111111111111111111111', [0, 0, 10, 10], 'EPSG:3857')],
    });
    const { rerender } = render(<SpatialProfilePreview profile={mismatch} />);
    expect(screen.getByText('CRS values cannot be compared.')).toBeDefined();

    rerender(<SpatialProfilePreview profile={profile({ rasters: [], spatialPreview: null })} />);
    expect(screen.getByText('Spatial preview unavailable')).toBeDefined();

    rerender(
      <SpatialProfilePreview
        profile={profile({
          spatialPreview: { features: [{ geometry: null }], type: 'FeatureCollection' },
        })}
      />
    );
    expect(screen.getByText(/contains no valid finite point geometries/i)).toBeDefined();
  });
});
