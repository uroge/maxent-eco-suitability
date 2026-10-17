import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MapCapabilities,
  MapInspection,
  Principal,
} from '@ecosuitability/contracts';
import type { ApiEnvironment } from '../env';
import { ApiException } from '../platform/errors/api.exception';
import { StorageService } from '../storage/storage.service';
import { AnalysisRepository } from './analysis.repository';

type TileStyle = 'suitability' | 'threshold' | 'predictor' | 'terrainrgb';

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
      ...(analysis.mapAssets ?? []).map((asset) => ({
        id: asset.id,
        label: asset.label,
        kind: 'predictor' as const,
        dataType: 'raster' as const,
        legend: [],
      })),
    );
    const terrain = analysis.mapAssets?.find((asset) => asset.terrainEligible);
    return {
      analysisId: analysis.id,
      basemaps: this.basemaps(),
      layers,
      terrain: {
        available: Boolean(terrain),
        layerId: terrain?.id ?? null,
        unavailableReason: terrain
          ? null
          : analysis.executionSnapshot?.configuration.visualization.terrain
            ? 'The selected elevation raster did not pass DEM publication checks.'
            : 'No continuous predictor was explicitly confirmed as elevation in metres.',
      },
      bounds: analysis.inputProfile?.rasters[0]?.bounds ?? [-180, -90, 180, 90],
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
    const url = new URL(
      `/v1/tiles/${style}/${z}/${x}/${y}.png`,
      this.config.getOrThrow('TILE_SERVICE_URL'),
    );
    url.searchParams.set('key', storageKey);
    const response = await fetch(url, {
      headers: {
        'x-tile-secret': this.config.getOrThrow('TILE_INTERNAL_SHARED_SECRET'),
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      signal: AbortSignal.timeout(
        this.config.getOrThrow('TILE_REQUEST_TIMEOUT_MS'),
      ),
    });
    if (!response.ok) {
      throw new ApiException(
        502,
        'DEPENDENCY_UNAVAILABLE',
        'Map tiles are temporarily unavailable.',
      );
    }
    const body = new Uint8Array(await response.arrayBuffer());
    if (body.byteLength > this.config.getOrThrow('TILE_RESPONSE_MAX_BYTES')) {
      throw new ApiException(
        502,
        'DEPENDENCY_UNAVAILABLE',
        'The tile response exceeded its limit.',
      );
    }
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
    return this.storage.getBytes(artifact.storageKey, 10 * 1024 * 1024);
  }

  public async terrain(
    principal: Principal,
    analysisId: string,
    z: number,
    x: number,
    y: number,
    requestId: string | undefined,
  ): Promise<{ body: Uint8Array; contentType: string }> {
    const analysis = await this.analysis(principal, analysisId);
    const asset = analysis.mapAssets?.find((item) => item.terrainEligible);
    if (!asset) {
      throw this.notFound();
    }
    const url = new URL(
      `/v1/tiles/terrainrgb/${z}/${x}/${y}.png`,
      this.config.getOrThrow('TILE_SERVICE_URL'),
    );
    url.searchParams.set('key', asset.storageKey);
    const response = await fetch(url, {
      headers: {
        'x-tile-secret': this.config.getOrThrow('TILE_INTERNAL_SHARED_SECRET'),
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      signal: AbortSignal.timeout(
        this.config.getOrThrow('TILE_REQUEST_TIMEOUT_MS'),
      ),
    });
    if (!response.ok) {
      throw new ApiException(
        502,
        'DEPENDENCY_UNAVAILABLE',
        'Terrain tiles are temporarily unavailable.',
      );
    }
    const body = new Uint8Array(await response.arrayBuffer());
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
    const artifact = analysis.resultManifest!.artifacts.find(
      (item) => item.kind === 'suitability-raster',
    );
    if (!artifact) {
      throw this.notFound();
    }
    const url = new URL(
      '/v1/point',
      this.config.getOrThrow('TILE_SERVICE_URL'),
    );
    url.searchParams.set('key', artifact.storageKey);
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('latitude', String(latitude));
    const response = await fetch(url, {
      headers: {
        'x-tile-secret': this.config.getOrThrow('TILE_INTERNAL_SHARED_SECRET'),
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      signal: AbortSignal.timeout(
        this.config.getOrThrow('TILE_REQUEST_TIMEOUT_MS'),
      ),
    });
    if (!response.ok) {
      throw new ApiException(
        502,
        'DEPENDENCY_UNAVAILABLE',
        'Map inspection is temporarily unavailable.',
      );
    }
    const value = (await response.json()) as { values?: unknown[] };
    const suitability =
      typeof value.values?.[0] === 'number' ? value.values[0] : null;
    return {
      longitude,
      latitude,
      suitability,
      thresholdClass: null,
      predictors: {},
      nearestOccurrenceMetres: null,
    };
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
        ? [{ id, label, styleUrl, attribution }]
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
