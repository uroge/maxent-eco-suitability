'use client';

import { useEffect, useEffectEvent, useReducer, useRef, type RefObject } from 'react';
import type { MapCapabilities } from '@ecosuitability/contracts';
import type { Coordinates } from './map-types';
import {
  installResultMapLayers,
  mapApiUrl,
  selectedResultMapStyle,
} from './result-map-style';

type RuntimeState = {
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

type RuntimeAction = { type: 'loading' } | { type: 'ready' } | { type: 'error'; message: string };

type ResultMapOptions = {
  analysisId: string;
  capabilities: MapCapabilities;
  mapRef: RefObject<import('maplibre-gl').Map | null>;
  activeLayersRef: RefObject<Set<string>>;
  opacityRef: RefObject<number>;
  terrainRef: RefObject<boolean>;
  basemap?: MapCapabilities['basemaps'][number];
  getToken: () => Promise<string | null>;
  onInspect: (coordinates: Coordinates) => void;
};

const reducer = (_state: RuntimeState, action: RuntimeAction): RuntimeState => {
  switch (action.type) {
    case 'loading':
      return { status: 'loading' };
    case 'ready':
      return { status: 'ready' };
    case 'error':
      return { status: 'error', error: action.message };
  }
};

export const useResultMap = ({
  analysisId,
  capabilities,
  mapRef,
  activeLayersRef,
  opacityRef,
  terrainRef,
  basemap,
  getToken,
  onInspect,
}: ResultMapOptions) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const coordinateOutputRef = useRef<HTMLSpanElement>(null);
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });
  const readToken = useEffectEvent(() => getToken());
  const inspect = useEffectEvent(onInspect);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    dispatch({ type: 'loading' });
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let initialFitPending = true;

    void Promise.all([import('maplibre-gl'), readToken()])
      .then(([maplibregl, token]) => {
        if (disposed) {
          return;
        }
        const map = new maplibregl.Map({
          container,
          style: selectedResultMapStyle(
            capabilities.basemaps[0],
            analysisId,
            capabilities,
            activeLayersRef.current,
            opacityRef.current
          ),
          bounds: capabilities.bounds,
          fitBoundsOptions: { padding: 30 },
          attributionControl: false,
          transformRequest: (url) =>
            url.startsWith(mapApiUrl) && token
              ? { url, headers: { Authorization: `Bearer ${token}` } }
              : { url },
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        const prepareStyle = (): void => {
          if (disposed) {
            return;
          }
          installResultMapLayers(
            map,
            analysisId,
            capabilities,
            activeLayersRef.current,
            opacityRef.current,
            terrainRef.current
          );
          window.requestAnimationFrame(() => {
            if (!disposed) {
              map.resize();
              if (initialFitPending) {
                initialFitPending = false;
                map.fitBounds(capabilities.bounds, { padding: 30, duration: 0 });
              }
              map.triggerRepaint();
              dispatch({ type: 'ready' });
            }
          });
        };
        map.on('style.load', prepareStyle);
        if (map.isStyleLoaded()) {
          prepareStyle();
        }
        map.on('error', (event) => {
          const detail = event.error?.message;
          dispatch({
            type: 'error',
            message: detail
              ? `A map source or style failed to load: ${detail}`
              : 'A map source or style failed to load.',
          });
        });
        map.on('mousemove', (event) => {
          if (coordinateOutputRef.current) {
            coordinateOutputRef.current.textContent = `${event.lngLat.lng.toFixed(5)}, ${event.lngLat.lat.toFixed(5)}`;
          }
        });
        map.on('click', (event) => {
          const coordinates = { longitude: event.lngLat.lng, latitude: event.lngLat.lat };
          if (coordinateOutputRef.current) {
            coordinateOutputRef.current.textContent = `${coordinates.longitude.toFixed(5)}, ${coordinates.latitude.toFixed(5)}`;
          }
          inspect(coordinates);
        });
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(container);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          dispatch({
            type: 'error',
            message: error instanceof Error ? error.message : 'The map could not be loaded.',
          });
        }
      });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [activeLayersRef, analysisId, capabilities, mapRef, opacityRef, terrainRef]);

  useEffect(() => {
    const applyStyle = (): void => {
      if (mapRef.current) {
        dispatch({ type: 'loading' });
        mapRef.current.setStyle(
          selectedResultMapStyle(
            basemap,
            analysisId,
            capabilities,
            activeLayersRef.current,
            opacityRef.current
          )
        );
      }
    };
    if (mapRef.current) {
      applyStyle();
    }
    const observer = new MutationObserver(applyStyle);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [activeLayersRef, analysisId, basemap, capabilities, mapRef, opacityRef]);

  return { containerRef, coordinateOutputRef, state };
};
