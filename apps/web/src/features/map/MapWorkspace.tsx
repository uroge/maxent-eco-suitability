'use client';

import { useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { MapCapabilities } from '@ecosuitability/contracts';
import { MapViewport } from './MapViewport';
import { useMapControls } from './useMapControls';
import { useMapInspection } from './useMapInspection';
import { useResultMap } from './useResultMap';

type MapWorkspaceProps = {
  analysisId: string;
  capabilities: MapCapabilities;
};

export const MapWorkspace: React.FC<MapWorkspaceProps> = ({ analysisId, capabilities }) => {
  const { getToken } = useAuth();
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const controls = useMapControls(mapRef, capabilities);
  const inspection = useMapInspection(analysisId);
  const runtime = useResultMap({
    analysisId,
    capabilities,
    mapRef,
    activeLayersRef: controls.activeLayersRef,
    opacityRef: controls.opacityRef,
    terrainRef: controls.terrainRef,
    basemap: controls.basemap,
    getToken,
    onInspect: inspection.inspect,
  });

  return (
    <MapViewport
      container={runtime.containerRef}
      coordinateOutputRef={runtime.coordinateOutputRef}
      capabilities={capabilities}
      basemap={controls.basemap}
      selectedBasemap={controls.state.selectedBasemap}
      activeLayers={controls.state.activeLayers}
      opacity={controls.state.opacity}
      terrainEnabled={controls.state.terrainEnabled}
      inspection={inspection.state.inspection}
      inspectionCoordinates={inspection.state.coordinates}
      inspectorOpen={inspection.state.inspectorOpen}
      mapLoading={runtime.state.status === 'loading'}
      mapError={runtime.state.error}
      inspectionLoading={inspection.state.status === 'loading'}
      inspectionError={inspection.state.error}
      onBasemapChange={controls.setBasemap}
      onLayerChange={controls.setLayer}
      onOpacityChange={controls.setOpacity}
      onTerrainToggle={controls.toggleTerrain}
      onInspectorOpenChange={inspection.setInspectorOpen}
      onInspectRetry={inspection.inspect}
      onReset={controls.reset}
    />
  );
};
