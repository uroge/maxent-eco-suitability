'use client';

import { useReducer, useRef, type RefObject } from 'react';
import type { MapCapabilities } from '@ecosuitability/contracts';

type ControlState = {
  activeLayers: Set<string>;
  opacity: number;
  terrainEnabled: boolean;
  selectedBasemap?: string;
};

type ControlAction =
  | { type: 'layers'; activeLayers: Set<string> }
  | { type: 'opacity'; opacity: number }
  | { type: 'terrain'; enabled: boolean }
  | { type: 'basemap'; basemapId: string };

const reducer = (state: ControlState, action: ControlAction): ControlState => {
  switch (action.type) {
    case 'layers':
      return { ...state, activeLayers: action.activeLayers };
    case 'opacity':
      return { ...state, opacity: action.opacity };
    case 'terrain':
      return { ...state, terrainEnabled: action.enabled };
    case 'basemap':
      return { ...state, selectedBasemap: action.basemapId };
  }
};

const initialState = (capabilities: MapCapabilities): ControlState => ({
  activeLayers: new Set(
    capabilities.layers
      .filter((layer) => layer.kind === 'suitability' || layer.kind === 'occurrences')
      .map((layer) => layer.id)
  ),
  opacity: 0.85,
  terrainEnabled: false,
});

export const useMapControls = (
  mapRef: RefObject<import('maplibre-gl').Map | null>,
  capabilities: MapCapabilities
) => {
  const [state, dispatch] = useReducer(reducer, capabilities, initialState);
  const activeLayersRef = useRef(state.activeLayers);
  const opacityRef = useRef(state.opacity);
  const terrainRef = useRef(state.terrainEnabled);
  const basemap =
    capabilities.basemaps.find((item) => item.id === state.selectedBasemap) ??
    capabilities.basemaps[0];

  const setLayer = (layerId: string, enabled: boolean): void => {
    const activeLayers = new Set(activeLayersRef.current);
    if (enabled) {
      activeLayers.add(layerId);
    } else {
      activeLayers.delete(layerId);
    }
    activeLayersRef.current = activeLayers;
    dispatch({ type: 'layers', activeLayers });
    if (mapRef.current?.getLayer(layerId)) {
      mapRef.current.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
    }
  };

  const setOpacity = (opacity: number): void => {
    opacityRef.current = opacity;
    dispatch({ type: 'opacity', opacity });
    for (const layer of capabilities.layers.filter((item) => item.dataType === 'raster')) {
      if (mapRef.current?.getLayer(layer.id)) {
        mapRef.current.setPaintProperty(layer.id, 'raster-opacity', opacity);
      }
    }
  };

  const toggleTerrain = (): void => {
    const enabled = !terrainRef.current;
    terrainRef.current = enabled;
    dispatch({ type: 'terrain', enabled });
    mapRef.current?.setTerrain(enabled ? { source: 'terrain-dem', exaggeration: 1.2 } : null);
    mapRef.current?.easeTo({ pitch: enabled ? 55 : 0, duration: 500 });
  };

  const reset = (resetBearing: boolean): void => {
    if (resetBearing) {
      terrainRef.current = false;
      dispatch({ type: 'terrain', enabled: false });
      mapRef.current?.setTerrain(null);
    }
    mapRef.current?.fitBounds(capabilities.bounds, {
      padding: 30,
      duration: 500,
      ...(resetBearing ? { pitch: 0, bearing: 0 } : {}),
    });
  };

  return {
    state,
    basemap,
    activeLayersRef,
    opacityRef,
    terrainRef,
    setLayer,
    setOpacity,
    toggleTerrain,
    reset,
    setBasemap: (basemapId: string) => dispatch({ type: 'basemap', basemapId }),
  };
};
