'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import {
  mapCapabilitiesResponseSchema,
  mapInspectionResponseSchema,
  type MapCapabilities,
  type MapInspection,
} from '@ecosuitability/contracts';
import {
  Button,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from '@ecosuitability/ui';
import { Crosshair, Focus, Layers3, LocateFixed, PanelRightClose, X } from 'lucide-react';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { ResultsShell } from '../results/ResultsShell';
import { MapInspector } from './MapInspector';
import { MapLayerPanel } from './MapLayerPanel';

type Coordinates = { longitude: number; latitude: number };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

const fallbackStyle = (): import('maplibre-gl').StyleSpecification => {
  const styles = getComputedStyle(document.documentElement);
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': styles.getPropertyValue('--surface-subtle').trim() },
      },
    ],
  };
};

export const MapScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const { getToken } = useAuth();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const activeRef = useRef<Set<string>>(new Set());
  const opacityRef = useRef(0.85);
  const terrainRef = useRef(false);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [opacity, setOpacity] = useState(0.85);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [inspection, setInspection] = useState<MapInspection>();
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [selectedBasemap, setSelectedBasemap] = useState<string>();
  const [themeRevision, setThemeRevision] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const capabilities = useQuery({
    queryKey: analysisKeys.map(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/map/capabilities`, mapCapabilitiesResponseSchema),
  });
  const value = capabilities.data?.capabilities;
  const basemap = useMemo(
    () => value?.basemaps.find((item) => item.id === selectedBasemap) ?? value?.basemaps[0],
    [selectedBasemap, value]
  );

  useEffect(() => {
    activeRef.current = activeLayers;
    opacityRef.current = opacity;
    terrainRef.current = terrainEnabled;
  }, [activeLayers, opacity, terrainEnabled]);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((revision) => revision + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const installLayers = useCallback(
    (map: import('maplibre-gl').Map, data: MapCapabilities) => {
      const styles = getComputedStyle(document.documentElement);
      for (const layer of data.layers) {
        const sourceId = `source-${layer.id}`;
        if (map.getSource(sourceId)) {
          continue;
        }
        const visibility = activeRef.current.has(layer.id) ? 'visible' : 'none';
        if (layer.dataType === 'raster') {
          map.addSource(sourceId, {
            type: 'raster',
            tiles: [`${apiUrl}/v1/analyses/${analysisId}/map/tiles/${layer.id}/{z}/{x}/{y}`],
            tileSize: 256,
          });
          map.addLayer({
            id: layer.id,
            source: sourceId,
            type: 'raster',
            layout: { visibility },
            paint: { 'raster-opacity': opacityRef.current },
          });
        } else {
          map.addSource(sourceId, {
            type: 'geojson',
            data: `${apiUrl}/v1/analyses/${analysisId}/map/vectors/${layer.id}`,
          });
          map.addLayer({
            id: layer.id,
            source: sourceId,
            type: 'circle',
            layout: { visibility },
            paint: {
              'circle-radius': 4,
              'circle-color': styles
                .getPropertyValue(
                  layer.kind === 'occurrences' ? '--suitability-4' : '--suitability-1'
                )
                .trim(),
              'circle-stroke-color': styles.getPropertyValue('--foreground').trim(),
              'circle-stroke-width': 1,
            },
          });
        }
      }
      if (data.terrain.available && !map.getSource('terrain-dem')) {
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: [`${apiUrl}/v1/analyses/${analysisId}/map/terrain/{z}/{x}/{y}`],
          tileSize: 256,
          encoding: 'mapbox',
        });
      }
      if (terrainRef.current && map.getSource('terrain-dem')) {
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 });
      }
    },
    [analysisId]
  );

  useEffect(() => {
    if (!container.current || !value || mapRef.current) {
      return;
    }
    const defaults = new Set(
      value.layers
        .filter((layer) => layer.kind === 'suitability' || layer.kind === 'occurrences')
        .map((layer) => layer.id)
    );
    activeRef.current = defaults;
    setActiveLayers(defaults);
    setSelectedBasemap(value.basemaps[0]?.id);
    let disposed = false;
    void (async () => {
      const [maplibregl, token] = await Promise.all([import('maplibre-gl'), getToken()]);
      if (disposed || !container.current) {
        return;
      }
      const preferred = value.basemaps[0];
      const dark = document.documentElement.dataset.theme === 'dark';
      const map = new maplibregl.Map({
        container: container.current,
        style: (dark ? preferred?.darkStyleUrl : null) ?? preferred?.styleUrl ?? fallbackStyle(),
        bounds: value.bounds,
        fitBoundsOptions: { padding: 30 },
        attributionControl: false,
        transformRequest: (url) =>
          url.startsWith(apiUrl) && token
            ? { url, headers: { Authorization: `Bearer ${token}` } }
            : { url },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('style.load', () => installLayers(map, value));
      map.on('mousemove', (event) => {
        setCoordinates({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
      });
      map.on('click', (event) => {
        const selected = { longitude: event.lngLat.lng, latitude: event.lngLat.lat };
        setCoordinates(selected);
        void api
          .json(
            `/v1/analyses/${analysisId}/map/inspect?longitude=${selected.longitude}&latitude=${selected.latitude}`,
            mapInspectionResponseSchema
          )
          .then((result) => {
            setInspection(result.inspection);
            if (window.matchMedia('(max-width: 1023px)').matches) {
              setInspectorOpen(true);
            }
          });
      });
      mapRef.current = map;
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [analysisId, api, getToken, installLayers, value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value) {
      return;
    }
    const dark = document.documentElement.dataset.theme === 'dark';
    map.setStyle((dark ? basemap?.darkStyleUrl : null) ?? basemap?.styleUrl ?? fallbackStyle());
  }, [basemap, themeRevision, value]);

  useEffect(() => {
    if (!value) {
      return;
    }
    for (const layer of value.layers.filter((item) => item.dataType === 'raster')) {
      if (mapRef.current?.getLayer(layer.id)) {
        mapRef.current.setPaintProperty(layer.id, 'raster-opacity', opacity);
      }
    }
  }, [opacity, value]);

  const toggle = (layerId: string, enabled: boolean): void => {
    const next = new Set(activeRef.current);
    if (enabled) {
      next.add(layerId);
    } else {
      next.delete(layerId);
    }
    activeRef.current = next;
    setActiveLayers(next);
    if (mapRef.current?.getLayer(layerId)) {
      mapRef.current.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
    }
  };

  const toggleTerrain = (): void => {
    const enabled = !terrainEnabled;
    mapRef.current?.setTerrain(enabled ? { source: 'terrain-dem', exaggeration: 1.2 } : null);
    mapRef.current?.easeTo({ pitch: enabled ? 55 : 0, duration: 500 });
    setTerrainEnabled(enabled);
  };

  const reset = (resetBearing: boolean): void => {
    if (!value) {
      return;
    }
    if (resetBearing) {
      setTerrainEnabled(false);
      mapRef.current?.setTerrain(null);
    }
    mapRef.current?.fitBounds(value.bounds, {
      padding: 30,
      duration: 500,
      ...(resetBearing ? { pitch: 0, bearing: 0 } : {}),
    });
  };

  return (
    <ResultsShell analysisId={analysisId} current="map">
      <div className="grid min-h-[calc(100vh-9rem)] lg:grid-cols-[18rem_1fr_20rem]">
        <aside className="hidden border-r border-border bg-surface p-5 lg:block">
          <MapLayerPanel
            capabilities={value}
            selectedBasemap={selectedBasemap}
            activeLayers={activeLayers}
            opacity={opacity}
            terrainEnabled={terrainEnabled}
            onBasemapChange={setSelectedBasemap}
            onLayerChange={toggle}
            onOpacityChange={setOpacity}
            onTerrainToggle={toggleTerrain}
          />
        </aside>
        <div className="relative min-h-[65vh] bg-muted lg:min-h-0">
          <div ref={container} className="absolute inset-0" />
          <div className="absolute left-3 top-3 flex gap-2 lg:hidden">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  <Layers3 size={16} />
                  Layers
                </Button>
              </DialogTrigger>
              <SheetContent className="left-0 right-auto border-l-0 border-r">
                <DialogTitle className="sr-only">Map layers</DialogTitle>
                <DialogDescription className="sr-only">
                  Select basemap, layers, opacity, and terrain.
                </DialogDescription>
                <DialogClose className="absolute right-3 top-3" aria-label="Close layers">
                  <X />
                </DialogClose>
                <MapLayerPanel
                  capabilities={value}
                  selectedBasemap={selectedBasemap}
                  activeLayers={activeLayers}
                  opacity={opacity}
                  terrainEnabled={terrainEnabled}
                  onBasemapChange={setSelectedBasemap}
                  onLayerChange={toggle}
                  onOpacityChange={setOpacity}
                  onTerrainToggle={toggleTerrain}
                />
              </SheetContent>
            </Dialog>
            <Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  <PanelRightClose size={16} />
                  Inspect
                </Button>
              </DialogTrigger>
              <SheetContent>
                <DialogTitle className="sr-only">Point inspector</DialogTitle>
                <DialogDescription className="sr-only">
                  Values sampled at the selected coordinate.
                </DialogDescription>
                <DialogClose className="absolute right-3 top-3" aria-label="Close inspector">
                  <X />
                </DialogClose>
                <MapInspector inspection={inspection} />
              </SheetContent>
            </Dialog>
          </div>
          <div className="absolute left-3 top-14 flex gap-2 lg:left-auto lg:right-12 lg:top-3">
            <Button
              aria-label="Fit analysis extent"
              size="sm"
              variant="secondary"
              onClick={() => reset(false)}
            >
              <Focus size={16} />
            </Button>
            <Button
              aria-label="Reset map view"
              size="sm"
              variant="secondary"
              onClick={() => reset(true)}
            >
              <LocateFixed size={16} />
            </Button>
          </div>
          <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 rounded bg-surface/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
            <Crosshair className="mr-1 inline" size={12} />
            {coordinates
              ? `${coordinates.longitude.toFixed(5)}, ${coordinates.latitude.toFixed(5)}`
              : 'Select the map to inspect a pixel'}
          </div>
          {basemap ? (
            <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 max-w-[50%] rounded bg-surface/90 px-2 py-1 text-right text-[10px] text-muted-foreground">
              {basemap.attribution}
            </div>
          ) : null}
        </div>
        <aside className="hidden border-l border-border bg-surface p-5 lg:block">
          <MapInspector inspection={inspection} />
        </aside>
      </div>
    </ResultsShell>
  );
};
