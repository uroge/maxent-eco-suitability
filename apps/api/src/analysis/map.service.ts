import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MapCapabilities,
  MapInspection,
  Principal,
} from '@ecosuitability/contracts';
import { geodesicDistanceMetres } from '@ecosuitability/geo-utils';
import type { ApiEnvironment } from '../env';
import { ApiException } from '../platform/errors/api.exception';
import { StorageService } from '../storage/storage.service';
import { AnalysisRepository } from './analysis.repository';
import type { StoredAnalysis } from './analysis.types';

type TileStyle = 'suitability' | 'threshold' | 'predictor' | 'terrainrgb';

type PointResponse = { values?: unknown[] };

type GeoJsonPosition = [number, number];

type GeographicBounds = [number, number, number, number];

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==',
  'base64',
);

@Injectable()
export class MapService {
  public constructor(
    private readonly repository: AnalysisRepository,
    private readonly storage: StorageService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  public async capabilities(
    principal: Principal,
    analysisId: string,
  ): Promise<MapCapabilities> {
    const analysis = await this.analysis(principal, analysisId);
    const layers: MapCapabilities['layers'] =
      analysis.resultManifest!.artifacts.flatMap(
        (artifact): MapCapabilities['layers'] => {
          if (artifact.kind === 'suitability-raster') {
            return [
              {
                id: artifact.id,
                label: 'Suitability',
                kind: 'suitability' as const,
                dataType: 'raster' as const,
                legend: [
                  { label: 'Low', value: 0, color: '#440154' },
                  { label: 'Medium', value: 0.5, color: '#21918c' },
                  { label: 'High', value: 1, color: '#fde725' },
                ],
              },
            ];
          }
          if (artifact.kind === 'suitability-threshold-raster') {
            return [
              {
                id: artifact.id,
                label: 'Threshold classification',
                kind: 'threshold' as const,
                dataType: 'raster' as const,
                legend: [
                  { label: 'Below threshold', value: 0, color: '#f5f5f5' },
                  { label: 'Suitable', value: 1, color: '#21918c' },
                ],
              },
            ];
          }
          if (
            artifact.kind === 'occurrences' ||
            artifact.kind === 'background'
          ) {
            return [
              {
                id: artifact.id,
                label:
                  artifact.kind === 'occurrences'
                    ? 'Occurrences'
                    : 'Background points',
                kind: artifact.kind,
                dataType: 'vector' as const,
                legend: [],
              },
            ];
          }
          return [];
        },
      );
    layers.push(
      ...(analysis.mapAssets ?? []).map((asset) => {
        const middle = (asset.raster.minimum + asset.raster.maximum) / 2;
        return {
          id: asset.id,
          label: asset.label,
          kind: 'predictor' as const,
          dataType: 'raster' as const,
          legend: [
            {
              label: this.legendValue(asset.raster.minimum),
              value: asset.raster.minimum,
              color: '#440154',
            },
            {
              label: this.legendValue(middle),
              value: middle,
              color: '#21918c',
            },
            {
              label: this.legendValue(asset.raster.maximum),
              value: asset.raster.maximum,
              color: '#fde725',
            },
          ],
        };
      }),
    );
    const terrain = analysis.mapAssets?.find((asset) => asset.terrainEligible);
    const selectedTerrainDatasetId =
      analysis.executionSnapshot?.configuration.visualization.terrain
        ?.datasetId;
    const selectedTerrainAsset = analysis.mapAssets?.find(
      (asset) => asset.datasetId === selectedTerrainDatasetId,
    );
    return {
      analysisId: analysis.id,
      basemaps: this.basemaps(),
      layers,
      terrain: {
        available: Boolean(terrain),
        layerId: terrain?.id ?? null,
        unavailableReason: terrain
          ? null
          : selectedTerrainDatasetId
            ? (selectedTerrainAsset?.terrainUnavailableReason ??
              'The selected elevation raster did not pass DEM publication checks.')
            : 'No continuous predictor was explicitly confirmed as elevation in metres.',
      },
      bounds: this.mapBounds(analysis),
    };
  }

  public async tile(
    principal: Principal,
    analysisId: string,
    layerId: string,
    z: number,
    x: number,
    y: number,
    requestId: string | undefined,
  ): Promise<{ body: Uint8Array; contentType: string }> {
    this.validateTileCoordinates(z, x, y);
    const analysis = await this.analysis(principal, analysisId);
    const artifact = analysis.resultManifest!.artifacts.find(
      (item) => item.id === layerId,
    );
    const mapAsset = analysis.mapAssets?.find((item) => item.id === layerId);
    const styles: Partial<Record<string, TileStyle>> = {
      'suitability-raster': 'suitability',
      'suitability-threshold-raster': 'threshold',
    };
    const style = artifact
      ? styles[artifact.kind]
      : mapAsset
        ? 'predictor'
        : undefined;
    const storageKey = artifact?.storageKey ?? mapAsset?.storageKey;
    if (!storageKey || !style) {
      throw this.notFound();
    }
    const rasterBounds = mapAsset
      ? mapAsset.raster.bounds
      : this.outputRasterBounds(analysis);
    if (
      rasterBounds &&
      !this.tileIntersectsBounds(z, x, y, rasterBounds)
    ) {
      return { body: transparentPng, contentType: 'image/png' };
    }
    const url = new URL(
      `/v1/tiles/${style}/${z}/${x}/${y}.png`,
      this.config.getOrThrow('TILE_SERVICE_URL'),
    );
    url.searchParams.set('key', storageKey);
    if (mapAsset) {
      url.searchParams.set('minimum', String(mapAsset.raster.minimum));
      url.searchParams.set('maximum', String(mapAsset.raster.maximum));
    }
    const response = await this.tileRequest(
      url,
      requestId,
      'Map tiles are temporarily unavailable.',
    );
    const body = await this.boundedBody(response);
    return {
      body,
      contentType: response.headers.get('content-type') ?? 'image/png',
    };
  }

  public async vector(
    principal: Principal,
    analysisId: string,
    layerId: string,
  ): Promise<Uint8Array> {
    const analysis = await this.analysis(principal, analysisId);
    const artifact = analysis.resultManifest!.artifacts.find(
      (item) =>
        item.id === layerId &&
        ['occurrences', 'background'].includes(item.kind),
    );
    if (!artifact) {
      throw this.notFound();
    }
    try {
      return await this.storage.getBytes(artifact.storageKey, 10 * 1024 * 1024);
    } catch {
      throw this.dependencyUnavailable(
        'The vector layer exceeded its limit or is temporarily unavailable.',
      );
    }
  }

  public async terrain(
    principal: Principal,
    analysisId: string,
    z: number,
    x: number,
    y: number,
    requestId: string | undefined,
  ): Promise<{ body: Uint8Array; contentType: string }> {
    this.validateTileCoordinates(z, x, y);
    const analysis = await this.analysis(principal, analysisId);
    const asset = analysis.mapAssets?.find((item) => item.terrainEligible);
    if (!asset) {
      throw this.notFound();
    }
    if (!this.tileIntersectsBounds(z, x, y, asset.raster.bounds)) {
      return { body: transparentPng, contentType: 'image/png' };
    }
    const url = new URL(
      `/v1/tiles/terrainrgb/${z}/${x}/${y}.png`,
      this.config.getOrThrow('TILE_SERVICE_URL'),
    );
    url.searchParams.set('key', asset.storageKey);
    const response = await this.tileRequest(
      url,
      requestId,
      'Terrain tiles are temporarily unavailable.',
    );
    const body = await this.boundedBody(response);
    return {
      body,
      contentType: response.headers.get('content-type') ?? 'image/png',
    };
  }

  public async inspect(
    principal: Principal,
    analysisId: string,
    longitude: number,
    latitude: number,
    requestId: string | undefined,
  ): Promise<MapInspection> {
    const analysis = await this.analysis(principal, analysisId);
    const suitabilityArtifact = analysis.resultManifest!.artifacts.find(
      (item) => item.kind === 'suitability-raster',
    );
    if (!suitabilityArtifact) {
      throw this.notFound();
    }
    const thresholdArtifact = analysis.resultManifest!.artifacts.find(
      (item) => item.kind === 'suitability-threshold-raster',
    );
    const occurrenceArtifact = analysis.resultManifest!.artifacts.find(
      (item) => item.kind === 'occurrences',
    );
    const samples = await Promise.all([
      this.sample(
        suitabilityArtifact.storageKey,
        longitude,
        latitude,
        requestId,
      ),
      thresholdArtifact
        ? this.sample(
            thresholdArtifact.storageKey,
            longitude,
            latitude,
            requestId,
          )
        : Promise.resolve(null),
      ...(analysis.mapAssets ?? []).map((asset) =>
        this.sample(asset.storageKey, longitude, latitude, requestId),
      ),
    ]);
    const [suitability, threshold, ...predictorValues] = samples;
    const predictors = Object.fromEntries(
      (analysis.mapAssets ?? []).map((asset, index) => [
        asset.label,
        predictorValues[index] ?? null,
      ]),
    );
    const nearestOccurrenceMetres = occurrenceArtifact
      ? await this.nearestOccurrence(
          occurrenceArtifact.storageKey,
          longitude,
          latitude,
        )
      : null;
    return {
      longitude,
      latitude,
      suitability,
      thresholdClass: threshold === 0 || threshold === 1 ? threshold : null,
      predictors,
      nearestOccurrenceMetres,
    };
  }

  private async sample(
    storageKey: string,
    longitude: number,
    latitude: number,
    requestId: string | undefined,
  ): Promise<number | null> {
    const url = new URL(
      '/v1/point',
      this.config.getOrThrow('TILE_SERVICE_URL'),
    );
    url.searchParams.set('key', storageKey);
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('latitude', String(latitude));
    const response = await this.tileRequest(
      url,
      requestId,
      'Map inspection is temporarily unavailable.',
    );
    const body = await this.boundedBody(response);
    let parsed: PointResponse;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body)) as PointResponse;
    } catch {
      throw this.dependencyUnavailable(
        'Map inspection returned an invalid response.',
      );
    }
    const value = parsed.values?.[0];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private async nearestOccurrence(
    storageKey: string,
    longitude: number,
    latitude: number,
  ): Promise<number | null> {
    let body: Uint8Array;
    try {
      body = await this.storage.getBytes(storageKey, 10 * 1024 * 1024);
    } catch {
      throw this.dependencyUnavailable(
        'Occurrence inspection is temporarily unavailable.',
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return null;
    }
    const positions = this.geoJsonPositions(payload);
    if (positions.length === 0) {
      return null;
    }
    return positions.reduce(
      (nearest, position) =>
        Math.min(
          nearest,
          geodesicDistanceMetres([longitude, latitude], position),
        ),
      Number.POSITIVE_INFINITY,
    );
  }

  private geoJsonPositions(payload: unknown): GeoJsonPosition[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    const features = (payload as { features?: unknown }).features;
    if (!Array.isArray(features) || features.length > 1_000_000) {
      return [];
    }
    return features.flatMap((feature) => {
      if (!feature || typeof feature !== 'object') {
        return [];
      }
      const geometry = (feature as { geometry?: unknown }).geometry;
      if (!geometry || typeof geometry !== 'object') {
        return [];
      }
      const candidate = geometry as { type?: unknown; coordinates?: unknown };
      if (
        candidate.type !== 'Point' ||
        !Array.isArray(candidate.coordinates) ||
        typeof candidate.coordinates[0] !== 'number' ||
        typeof candidate.coordinates[1] !== 'number'
      ) {
        return [];
      }
      const position: GeoJsonPosition = [
        candidate.coordinates[0],
        candidate.coordinates[1],
      ];
      return position[0] >= -180 &&
        position[0] <= 180 &&
        position[1] >= -90 &&
        position[1] <= 90
        ? [position]
        : [];
    });
  }

  private mapBounds(
    analysis: StoredAnalysis,
  ): [number, number, number, number] {
    const rasterBounds = analysis.inputProfile?.rasters[0]?.bounds;
    if (
      rasterBounds &&
      rasterBounds[0] >= -180 &&
      rasterBounds[2] <= 180 &&
      rasterBounds[1] >= -90 &&
      rasterBounds[3] <= 90
    ) {
      return rasterBounds;
    }
    const coordinates: GeoJsonPosition[] = [];
    const visit = (value: unknown): void => {
      if (!Array.isArray(value)) {
        return;
      }
      if (
        value.length >= 2 &&
        typeof value[0] === 'number' &&
        typeof value[1] === 'number' &&
        value[0] >= -180 &&
        value[0] <= 180 &&
        value[1] >= -90 &&
        value[1] <= 90
      ) {
        coordinates.push([value[0], value[1]]);
        return;
      }
      for (const child of value) {
        visit(child);
      }
    };
    for (const feature of analysis.inputProfile?.spatialPreview?.features ??
      []) {
      if (feature && typeof feature === 'object') {
        visit(
          (feature as { geometry?: { coordinates?: unknown } }).geometry
            ?.coordinates,
        );
      }
    }
    if (coordinates.length === 0) {
      return [-180, -90, 180, 90];
    }
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    const west = Math.min(...longitudes);
    const east = Math.max(...longitudes);
    const south = Math.min(...latitudes);
    const north = Math.max(...latitudes);
    const longitudePadding = Math.max((east - west) * 0.05, 0.01);
    const latitudePadding = Math.max((north - south) * 0.05, 0.01);
    return [
      Math.max(-180, west - longitudePadding),
      Math.max(-90, south - latitudePadding),
      Math.min(180, east + longitudePadding),
      Math.min(90, north + latitudePadding),
    ];
  }

  private async tileRequest(
    url: URL,
    requestId: string | undefined,
    message: string,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'x-tile-secret': this.config.getOrThrow(
            'TILE_INTERNAL_SHARED_SECRET',
          ),
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        signal: AbortSignal.timeout(
          this.config.getOrThrow('TILE_REQUEST_TIMEOUT_MS'),
        ),
      });
    } catch {
      throw this.dependencyUnavailable(message);
    }
    if (!response.ok) {
      throw this.dependencyUnavailable(message);
    }
    return response;
  }

  private async boundedBody(response: Response): Promise<Uint8Array> {
    const limit = this.config.getOrThrow('TILE_RESPONSE_MAX_BYTES');
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > limit) {
      await response.body?.cancel();
      throw this.dependencyUnavailable('The tile response exceeded its limit.');
    }
    if (!response.body) {
      throw this.dependencyUnavailable(
        'The tile service returned an empty response.',
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      length += result.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw this.dependencyUnavailable(
          'The tile response exceeded its limit.',
        );
      }
      chunks.push(result.value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  private legendValue(value: number): string {
    return new Intl.NumberFormat('en', { maximumSignificantDigits: 4 }).format(
      value,
    );
  }

  private validateTileCoordinates(z: number, x: number, y: number): void {
    if (z > 22 || x >= 2 ** z || y >= 2 ** z) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'The requested tile coordinate is invalid.',
      );
    }
  }

  private outputRasterBounds(
    analysis: StoredAnalysis,
  ): GeographicBounds | undefined {
    const predictorBounds = (analysis.mapAssets ?? []).map(
      (asset) => asset.raster.bounds,
    );
    const bounds =
      predictorBounds.length > 0
        ? predictorBounds
        : (analysis.inputProfile?.rasters ?? []).map((raster) => raster.bounds);
    if (bounds.length === 0) {
      return undefined;
    }
    const intersection: GeographicBounds = [
      Math.max(...bounds.map((value) => value[0])),
      Math.max(...bounds.map((value) => value[1])),
      Math.min(...bounds.map((value) => value[2])),
      Math.min(...bounds.map((value) => value[3])),
    ];
    return intersection[0] < intersection[2] && intersection[1] < intersection[3]
      ? intersection
      : undefined;
  }

  private tileIntersectsBounds(
    z: number,
    x: number,
    y: number,
    bounds: GeographicBounds,
  ): boolean {
    const tileCount = 2 ** z;
    const west = (x / tileCount) * 360 - 180;
    const east = ((x + 1) / tileCount) * 360 - 180;
    const latitude = (tileY: number): number =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / tileCount))) * 180) /
      Math.PI;
    const north = latitude(y);
    const south = latitude(y + 1);
    return (
      east > bounds[0] &&
      west < bounds[2] &&
      north > bounds[1] &&
      south < bounds[3]
    );
  }

  private dependencyUnavailable(message: string): ApiException {
    return new ApiException(502, 'DEPENDENCY_UNAVAILABLE', message);
  }

  private basemaps(): MapCapabilities['basemaps'] {
    const definitions = [
      ['light', 'Light', 'MAP_LIGHT_STYLE_URL', 'MAP_LIGHT_ATTRIBUTION'],
      [
        'satellite',
        'Satellite',
        'MAP_SATELLITE_STYLE_URL',
        'MAP_SATELLITE_ATTRIBUTION',
      ],
      [
        'terrain',
        'Terrain',
        'MAP_TERRAIN_STYLE_URL',
        'MAP_TERRAIN_ATTRIBUTION',
      ],
    ] as const;
    return definitions.flatMap(([id, label, urlKey, attributionKey]) => {
      const styleUrl = this.config.get(urlKey);
      const attribution = this.config.get(attributionKey);
      return styleUrl && attribution
        ? [
            {
              id,
              label,
              styleUrl,
              darkStyleUrl:
                id === 'light'
                  ? (this.config.get('MAP_DARK_STYLE_URL') ?? null)
                  : null,
              attribution,
            },
          ]
        : [];
    });
  }

  private async analysis(principal: Principal, analysisId: string) {
    const analysis = await this.repository.findOwned(
      analysisId,
      principal.userId,
    );
    if (analysis?.status !== 'succeeded' || !analysis.resultManifest) {
      throw this.notFound();
    }
    return analysis;
  }

  private notFound(): ApiException {
    return new ApiException(
      404,
      'NOT_FOUND',
      'The requested resource was not found.',
    );
  }
}
