'use client';

import { useEffect, useEffectEvent, useReducer, useRef, type RefObject } from 'react';
import type { MapCapabilities } from '@ecosuitability/contracts';
import type { Coordinates } from './map-types';
import { createMapTokenController, type MapTokenGetter } from './map-token-controller';
import { installResultMapLayers, mapApiUrl, selectedResultMapStyle } from './result-map-style';

type RuntimeState = {
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

type RuntimeAction = { type: 'loading' } | { type: 'ready' } | { type: 'error'; message: string };

export type AuthenticatedMapRuntimeOptions = {
  activeLayersRef: RefObject<Set<string>>;
  analysisId: string;
  basemap?: MapCapabilities['basemaps'][number];
  capabilities: MapCapabilities;
  fitPadding: number;
  getToken: MapTokenGetter;
  inspection: boolean;
  interactive: boolean;
  mapRef: RefObject<import('maplibre-gl').Map | null>;
  navigationControls: boolean;
  onInspect?: (coordinates: Coordinates) => void;
  opacityRef: RefObject<number>;
  terrainRef: RefObject<boolean>;
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

export const useAuthenticatedMapRuntime = ({
  activeLayersRef,
  analysisId,
  basemap,
  capabilities,
  fitPadding,
  getToken,
  inspection,
  interactive,
  mapRef,
  navigationControls,
  onInspect,
  opacityRef,
  terrainRef,
}: AuthenticatedMapRuntimeOptions) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const coordinateOutputRef = useRef<HTMLSpanElement>(null);
  const styleKeyRef = useRef<string | undefined>(undefined);
  const initialBasemapRef = useRef(basemap ?? capabilities.basemaps[0]);
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });
  const readToken = useEffectEvent((options?: { skipCache?: boolean }) => getToken(options));
  const inspect = useEffectEvent((coordinates: Coordinates) => onInspect?.(coordinates));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    dispatch({ type: 'loading' });
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let initialFitPending = true;
    const tokenController = createMapTokenController(readToken);

    void Promise.all([import('maplibre-gl'), tokenController.start()])
      .then(([maplibregl]) => {
        if (disposed) {
          return;
        }
        const initialBasemap = initialBasemapRef.current;
        const initialStyleKey = resultStyleKey(initialBasemap);
        styleKeyRef.current = initialStyleKey;
        const map = new maplibregl.Map({
          container,
          style: selectedResultMapStyle(
            initialBasemap,
            analysisId,
            capabilities,
            activeLayersRef.current,
            opacityRef.current
          ),
          bounds: capabilities.bounds,
          fitBoundsOptions: { padding: fitPadding },
          attributionControl: false,
          interactive,
          transformRequest: (url) => {
            const token = tokenController.current();
            return isMapApiRequest(url) && token
              ? { url, headers: { Authorization: `Bearer ${token}` } }
              : { url };
          },
        });
        mapRef.current = map;
        if (navigationControls) {
          map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        }
        const prepareStyle = (): void => {
          if (disposed || styleKeyRef.current !== initialStyleKey) {
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
                map.fitBounds(capabilities.bounds, { padding: fitPadding, duration: 0 });
              }
              map.triggerRepaint();
              dispatch({ type: 'ready' });
            }
          });
        };
        map.once('style.load', prepareStyle);
        if (map.isStyleLoaded()) {
          map.off('style.load', prepareStyle);
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
        if (inspection) {
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
        }
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
      tokenController.stop();
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [
    activeLayersRef,
    analysisId,
    capabilities,
    fitPadding,
    inspection,
    interactive,
    mapRef,
    navigationControls,
    opacityRef,
    terrainRef,
  ]);

  useEffect(() => {
    const applyStyle = (): void => {
      const map = mapRef.current;
      const nextKey = resultStyleKey(basemap);
      if (!map || styleKeyRef.current === nextKey) {
        return;
      }
      styleKeyRef.current = nextKey;
      dispatch({ type: 'loading' });
      const prepareStyle = (): void => {
        if (styleKeyRef.current !== nextKey) {
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
        map.resize();
        map.triggerRepaint();
        dispatch({ type: 'ready' });
      };
      map.once('style.load', prepareStyle);
      map.setStyle(
        selectedResultMapStyle(
          basemap,
          analysisId,
          capabilities,
          activeLayersRef.current,
          opacityRef.current
        )
      );
    };
    applyStyle();
    const observer = new MutationObserver(applyStyle);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [activeLayersRef, analysisId, basemap, capabilities, mapRef, opacityRef, terrainRef]);

  return { containerRef, coordinateOutputRef, state };
};

const resultStyleKey = (basemap: MapCapabilities['basemaps'][number] | undefined): string => {
  const dark = document.documentElement.dataset.theme === 'dark';
  return dark
    ? (basemap?.darkStyleUrl ?? basemap?.styleUrl ?? 'fallback:dark')
    : (basemap?.styleUrl ?? 'fallback:light');
};

export const isMapApiRequest = (url: string, apiUrl = mapApiUrl): boolean => {
  try {
    const candidate = new URL(url);
    const api = new URL(apiUrl);
    const apiPath = api.pathname.replace(/\/$/, '');
    return (
      candidate.origin === api.origin &&
      (candidate.pathname === apiPath || candidate.pathname.startsWith(`${apiPath}/`))
    );
  } catch {
    return false;
  }
};
