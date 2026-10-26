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
import { Skeleton } from '@ecosuitability/ui';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { ResultsShell } from '../results/ResultsShell';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { MapViewport } from './MapViewport';

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
  const inspectionRequest = useRef<AbortController | undefined>(undefined);
  const [layerSelection, setLayerSelection] = useState<Set<string>>();
  const [opacity, setOpacity] = useState(0.85);
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [inspection, setInspection] = useState<MapInspection>();
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [inspectionCoordinates, setInspectionCoordinates] = useState<Coordinates>();
  const [selectedBasemap, setSelectedBasemap] = useState<string>();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string>();
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string>();
  const capabilities = useQuery({
    queryKey: analysisKeys.map(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/map/capabilities`, mapCapabilitiesResponseSchema),
  });
  const value = capabilities.data?.capabilities;
  const defaultLayers = useMemo(
    () =>
      new Set(
        value?.layers
          .filter((layer) => layer.kind === 'suitability' || layer.kind === 'occurrences')
          .map((layer) => layer.id) ?? []
      ),
    [value]
  );
  const activeLayers = layerSelection ?? defaultLayers;
  const basemap = useMemo(
    () => value?.basemaps.find((item) => item.id === selectedBasemap) ?? value?.basemaps[0],
    [selectedBasemap, value]
  );
  const basemapStyleUrl = basemap?.styleUrl;
  const basemapDarkStyleUrl = basemap?.darkStyleUrl;

  const inspectPoint = useCallback(
    (selected: Coordinates) => {
      inspectionRequest.current?.abort();
      const controller = new AbortController();
      inspectionRequest.current = controller;
      setInspectionLoading(true);
      setInspectionError(undefined);
      void api
        .json(
          `/v1/analyses/${analysisId}/map/inspect?longitude=${selected.longitude}&latitude=${selected.latitude}`,
          mapInspectionResponseSchema,
          { signal: controller.signal }
        )
        .then((result) => {
          if (controller.signal.aborted) return;
          setInspection(result.inspection);
          if (window.matchMedia('(max-width: 1023px)').matches) setInspectorOpen(true);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setInspectionError(error instanceof Error ? error.message : 'Inspection failed.');
          }
        })
        .finally(() => {
          if (inspectionRequest.current === controller) setInspectionLoading(false);
        });
    },
    [analysisId, api]
  );

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
    activeRef.current = defaultLayers;
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
      map.on('style.load', () => {
        installLayers(map, value);
        setMapLoading(false);
      });
      map.on('error', () => setMapError('A map source or style failed to load.'));
      map.on('mousemove', (event) => {
        setCoordinates({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
      });
      map.on('click', (event) => {
        const selected = { longitude: event.lngLat.lng, latitude: event.lngLat.lat };
        setCoordinates(selected);
        setInspectionCoordinates(selected);
        inspectPoint(selected);
      });
      mapRef.current = map;
    })().catch((error) => {
      if (!disposed) {
        setMapLoading(false);
        setMapError(error instanceof Error ? error.message : 'The map could not be loaded.');
      }
    });
    return () => {
      disposed = true;
      inspectionRequest.current?.abort();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [analysisId, defaultLayers, getToken, inspectPoint, installLayers, value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const dark = document.documentElement.dataset.theme === 'dark';
    map.setStyle((dark ? basemapDarkStyleUrl : null) ?? basemapStyleUrl ?? fallbackStyle());
  }, [basemapDarkStyleUrl, basemapStyleUrl]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const map = mapRef.current;
      if (map) {
        const dark = document.documentElement.dataset.theme === 'dark';
        map.setStyle((dark ? basemapDarkStyleUrl : null) ?? basemapStyleUrl ?? fallbackStyle());
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [basemapDarkStyleUrl, basemapStyleUrl]);

  const toggle = (layerId: string, enabled: boolean): void => {
    const next = new Set(activeRef.current);
    if (enabled) {
      next.add(layerId);
    } else {
      next.delete(layerId);
    }
    activeRef.current = next;
    setLayerSelection(next);
    if (mapRef.current?.getLayer(layerId)) {
      mapRef.current.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
    }
  };

  const toggleTerrain = (): void => {
    const enabled = !terrainEnabled;
    terrainRef.current = enabled;
    mapRef.current?.setTerrain(enabled ? { source: 'terrain-dem', exaggeration: 1.2 } : null);
    mapRef.current?.easeTo({ pitch: enabled ? 55 : 0, duration: 500 });
    setTerrainEnabled(enabled);
  };

  const reset = (resetBearing: boolean): void => {
    if (!value) {
      return;
    }
    if (resetBearing) {
      terrainRef.current = false;
      setTerrainEnabled(false);
      mapRef.current?.setTerrain(null);
    }
    mapRef.current?.fitBounds(value.bounds, {
      padding: 30,
      duration: 500,
      ...(resetBearing ? { pitch: 0, bearing: 0 } : {}),
    });
  };

  const changeOpacity = (nextOpacity: number): void => {
    opacityRef.current = nextOpacity;
    setOpacity(nextOpacity);
    if (!value) {
      return;
    }
    for (const layer of value.layers.filter((item) => item.dataType === 'raster')) {
      if (mapRef.current?.getLayer(layer.id)) {
        mapRef.current.setPaintProperty(layer.id, 'raster-opacity', nextOpacity);
      }
    }
  };

  return (
    <ResultsShell analysisId={analysisId} current="map">
      {capabilities.isError ? (
        <div className="mx-auto max-w-4xl p-6">
          <QueryStateAlert
            error={capabilities.error}
            title="Map capabilities unavailable"
            onRetry={() => void capabilities.refetch()}
          />
        </div>
      ) : null}
      {capabilities.isPending ? <Skeleton className="m-6 h-[60vh]" /> : null}
      {value ? (
        <MapViewport
          container={container}
          capabilities={value}
          basemap={basemap}
          selectedBasemap={selectedBasemap}
          activeLayers={activeLayers}
          opacity={opacity}
          terrainEnabled={terrainEnabled}
          inspection={inspection}
          coordinates={coordinates}
          inspectionCoordinates={inspectionCoordinates}
          inspectorOpen={inspectorOpen}
          mapLoading={mapLoading}
          mapError={mapError}
          inspectionLoading={inspectionLoading}
          inspectionError={inspectionError}
          onBasemapChange={setSelectedBasemap}
          onLayerChange={toggle}
          onOpacityChange={changeOpacity}
          onTerrainToggle={toggleTerrain}
          onInspectorOpenChange={setInspectorOpen}
          onInspectRetry={inspectPoint}
          onReset={reset}
        />
      ) : null}
    </ResultsShell>
  );
};
