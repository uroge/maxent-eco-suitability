'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import {
  mapCapabilitiesResponseSchema,
  mapInspectionResponseSchema,
  type MapInspection,
} from '@ecosuitability/contracts';
import { Alert, Button, Checkbox, Slider } from '@ecosuitability/ui';
import { Crosshair, Layers3 } from 'lucide-react';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { ResultsShell } from '../results/ResultsShell';

export const MapScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const { getToken } = useAuth();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [opacity, setOpacity] = useState(0.85);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [inspection, setInspection] = useState<MapInspection>();
  const capabilities = useQuery({
    queryKey: analysisKeys.map(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/map/capabilities`, mapCapabilitiesResponseSchema),
  });

  useEffect(() => {
    const value = capabilities.data?.capabilities;
    if (!container.current || !value || mapRef.current) return;
    let disposed = false;
    void (async () => {
      const [maplibregl, token] = await Promise.all([import('maplibre-gl'), getToken()]);
      if (disposed || !container.current) return;
      const theme = getComputedStyle(document.documentElement);
      const surfaceSubtle = theme.getPropertyValue('--surface-subtle').trim();
      const suitabilityHigh = theme.getPropertyValue('--suitability-4').trim();
      const suitabilityLow = theme.getPropertyValue('--suitability-1').trim();
      const foreground = theme.getPropertyValue('--foreground').trim();
      const map = new maplibregl.Map({
        container: container.current,
        style: value.basemaps[0]?.styleUrl ?? {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': surfaceSubtle },
            },
          ],
        },
        bounds: value.bounds,
        fitBoundsOptions: { padding: 30 },
        transformRequest: (url) =>
          url.startsWith(process.env.NEXT_PUBLIC_API_URL ?? '') && token
            ? { url, headers: { Authorization: `Bearer ${token}` } }
            : { url },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('load', () => {
        for (const layer of value.layers) {
          const sourceId = `source-${layer.id}`;
          if (layer.dataType === 'raster') {
            map.addSource(sourceId, {
              type: 'raster',
              tiles: [
                `${process.env.NEXT_PUBLIC_API_URL}/v1/analyses/${analysisId}/map/tiles/${layer.id}/{z}/{x}/{y}`,
              ],
              tileSize: 256,
            });
            map.addLayer({
              id: layer.id,
              source: sourceId,
              type: 'raster',
              layout: { visibility: layer.kind === 'suitability' ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0.85 },
            });
          } else {
            map.addSource(sourceId, {
              type: 'geojson',
              data: `${process.env.NEXT_PUBLIC_API_URL}/v1/analyses/${analysisId}/map/vectors/${layer.id}`,
            });
            map.addLayer({
              id: layer.id,
              source: sourceId,
              type: 'circle',
              layout: { visibility: layer.kind === 'occurrences' ? 'visible' : 'none' },
              paint: {
                'circle-radius': 4,
                'circle-color': layer.kind === 'occurrences' ? suitabilityHigh : suitabilityLow,
                'circle-stroke-color': foreground,
                'circle-stroke-width': 1,
              },
            });
          }
        }
        if (value.terrain.available) {
          map.addSource('terrain-dem', {
            type: 'raster-dem',
            tiles: [
              `${process.env.NEXT_PUBLIC_API_URL}/v1/analyses/${analysisId}/map/terrain/{z}/{x}/{y}`,
            ],
            tileSize: 256,
            encoding: 'mapbox',
          });
        }
        setActiveLayers(
          new Set(
            value.layers
              .filter((layer) => layer.kind === 'suitability' || layer.kind === 'occurrences')
              .map((layer) => layer.id)
          )
        );
      });
      map.on('click', (event) => {
        void api
          .json(
            `/v1/analyses/${analysisId}/map/inspect?longitude=${event.lngLat.lng}&latitude=${event.lngLat.lat}`,
            mapInspectionResponseSchema
          )
          .then((result) => setInspection(result.inspection));
      });
      mapRef.current = map;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [analysisId, api, capabilities.data, getToken]);

  const toggle = (layerId: string, enabled: boolean): void => {
    setActiveLayers((current) => {
      const next = new Set(current);
      if (enabled) {
        next.add(layerId);
      } else {
        next.delete(layerId);
      }
      return next;
    });
    mapRef.current?.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
  };
  useEffect(() => {
    const value = capabilities.data?.capabilities;
    if (!value) return;
    for (const layer of value.layers.filter((item) => item.dataType === 'raster')) {
      if (mapRef.current?.getLayer(layer.id))
        mapRef.current.setPaintProperty(layer.id, 'raster-opacity', opacity);
    }
  }, [capabilities.data, opacity]);

  const toggleTerrain = (): void => {
    const enabled = !terrainEnabled;
    mapRef.current?.setTerrain(enabled ? { source: 'terrain-dem', exaggeration: 1.2 } : null);
    mapRef.current?.easeTo({ pitch: enabled ? 55 : 0, duration: 500 });
    setTerrainEnabled(enabled);
  };

  return (
    <ResultsShell analysisId={analysisId} current="map">
      <div className="grid min-h-[calc(100vh-9rem)] lg:grid-cols-[18rem_1fr_20rem]">
        <aside className="border-b border-border bg-surface p-5 lg:border-b-0 lg:border-r">
          <h1 className="flex items-center gap-2 font-semibold">
            <Layers3 size={18} />
            Map layers
          </h1>
          <div className="mt-5 space-y-4">
            {capabilities.data?.capabilities.layers.map((layer) => (
              <label className="flex min-h-10 items-center gap-3 text-sm" key={layer.id}>
                <Checkbox
                  checked={activeLayers.has(layer.id)}
                  onCheckedChange={(checked) => toggle(layer.id, checked === true)}
                />
                {layer.label}
              </label>
            ))}
          </div>
          <label className="mt-6 block text-xs font-medium text-muted-foreground">
            Raster opacity
          </label>
          <Slider
            className="mt-2"
            min={0}
            max={1}
            step={0.05}
            value={[opacity]}
            onValueChange={([value]) => setOpacity(value ?? 0)}
          />
          <Alert
            className="mt-6"
            variant={capabilities.data?.capabilities.terrain.available ? 'success' : 'information'}
          >
            {capabilities.data?.capabilities.terrain.available
              ? '3D terrain is available.'
              : capabilities.data?.capabilities.terrain.unavailableReason}
          </Alert>
          <Button
            className="mt-3 w-full"
            disabled={!capabilities.data?.capabilities.terrain.available}
            variant="secondary"
            onClick={toggleTerrain}
          >
            {terrainEnabled ? 'Return to 2D' : 'Enable 3D terrain'}
          </Button>
        </aside>
        <div className="relative min-h-[55vh] bg-muted">
          <div ref={container} className="absolute inset-0" />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-surface/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
            <Crosshair className="mr-1 inline" size={12} />
            Select the map to inspect a pixel
          </div>
        </div>
        <aside className="border-t border-border bg-surface p-5 lg:border-l lg:border-t-0">
          <h2 className="font-semibold">Point inspector</h2>
          {inspection ? (
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Coordinates</dt>
                <dd className="font-mono">
                  {inspection.longitude.toFixed(5)}, {inspection.latitude.toFixed(5)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Suitability</dt>
                <dd className="font-mono text-xl">
                  {inspection.suitability?.toFixed(4) ?? 'No data'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Nearest occurrence</dt>
                <dd>
                  {inspection.nearestOccurrenceMetres === null
                    ? 'Not calculated'
                    : `${inspection.nearestOccurrenceMetres.toFixed(0)} m`}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Choose a location to sample the suitability COG. Predictor values appear when
              published predictor map assets are available.
            </p>
          )}
        </aside>
      </div>
    </ResultsShell>
  );
};
