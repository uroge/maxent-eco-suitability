import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisArtifactSpecifications } from '@ecosuitability/contracts';
import { MapService } from './map.service';

const analysisId = 'an_0123456789abcdef0123456789abcdef';
const principal = {
  userId: 'user_1',
  sessionId: 'session_1',
  role: 'user' as const,
};

const raster = {
  cog: true as const,
  overviewCount: 2,
  compression: 'DEFLATE',
  nodata: -9999,
  crs: 'EPSG:4326',
  bounds: [-10, -10, 10, 10] as [number, number, number, number],
  resolution: [1, 1] as [number, number],
  width: 20,
  height: 20,
  dataType: 'Float32',
  finiteValueCount: 400,
  minimum: 10,
  maximum: 20,
};

const analysis = {
  id: analysisId,
  status: 'succeeded',
  resultManifest: {
    artifacts: analysisArtifactSpecifications.map((definition, index) => ({
      id: `ar_${String(index).padStart(32, '0')}`,
      ...definition,
      storageKey: `analyses/${analysisId}/results/${definition.filename}`,
    })),
  },
  mapAssets: [
    {
      id: `ml_${'1'.repeat(32)}`,
      datasetId: `ds_${'2'.repeat(32)}`,
      label: 'Elevation',
      storageKey: `analyses/${analysisId}/map-assets/elevation.tif`,
      terrainEligible: true,
      raster,
    },
  ],
  inputProfile: { rasters: [{ bounds: raster.bounds }] },
  executionSnapshot: { configuration: { visualization: { terrain: null } } },
};

const config = {
  getOrThrow: (key: string) =>
    ({
      TILE_SERVICE_URL: 'http://tiles:8081',
      TILE_INTERNAL_SHARED_SECRET: 'a'.repeat(32),
      TILE_REQUEST_TIMEOUT_MS: 5000,
      TILE_RESPONSE_MAX_BYTES: 1024,
    })[key],
  get: () => undefined,
};

describe('MapService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns predictor legends from verified raster ranges', async () => {
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      {} as never,
      config as never,
    );
    const result = await service.capabilities(principal, analysisId);
    expect(
      result.layers
        .find((layer) => layer.kind === 'predictor')
        ?.legend.map((item) => item.value),
    ).toEqual([10, 15, 20]);
  });

  it('samples outputs and predictors and calculates nearest occurrence distance', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ values: [0.75] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ values: [1] })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ values: [123.5] })),
        ),
    );
    const storage = {
      getBytes: vi.fn().mockResolvedValue(
        new TextEncoder().encode(
          JSON.stringify({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0.01, 0] },
              },
            ],
          }),
        ),
      ),
    };
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      storage as never,
      config as never,
    );
    const result = await service.inspect(
      principal,
      analysisId,
      0,
      0,
      'request-1',
    );
    expect(result).toMatchObject({
      suitability: 0.75,
      thresholdClass: 1,
      predictors: { Elevation: 123.5 },
    });
    expect(result.nearestOccurrenceMetres).toBeGreaterThan(1000);
    expect(result.nearestOccurrenceMetres).toBeLessThan(1200);
  });

  it('rejects oversized and failed tile responses', async () => {
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      {} as never,
      config as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(2048), {
          headers: { 'content-length': '2048' },
        }),
      ),
    );
    await expect(
      service.tile(
        principal,
        analysisId,
        `ar_${'4'.padStart(32, '0')}`,
        0,
        0,
        0,
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array(2048))),
    );
    await expect(
      service.tile(
        principal,
        analysisId,
        `ar_${'4'.padStart(32, '0')}`,
        0,
        0,
        0,
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 502 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(
      service.terrain(principal, analysisId, 0, 0, 0, undefined),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('rejects invalid tile coordinates before contacting the private service', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      {} as never,
      config as never,
    );
    await expect(
      service.tile(
        principal,
        analysisId,
        `ar_${'4'.padStart(32, '0')}`,
        1,
        2,
        0,
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(request).not.toHaveBeenCalled();
  });

  it('returns a transparent tile outside the published raster bounds', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      {} as never,
      config as never,
    );
    const result = await service.tile(
      principal,
      analysisId,
      `ar_${'4'.padStart(32, '0')}`,
      6,
      30,
      22,
      undefined,
    );
    expect(result.contentType).toBe('image/png');
    expect(Array.from(result.body.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(request).not.toHaveBeenCalled();
  });

  it('turns oversized vector reads into a bounded dependency response', async () => {
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(analysis) } as never,
      { getBytes: vi.fn().mockRejectedValue(new Error('too large')) } as never,
      config as never,
    );
    await expect(
      service.vector(principal, analysisId, `ar_${'6'.padStart(32, '0')}`),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('masks foreign ownership without calling the tile service', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const service = new MapService(
      { findOwned: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      config as never,
    );
    await expect(
      service.capabilities(principal, analysisId),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(request).not.toHaveBeenCalled();
  });
});
