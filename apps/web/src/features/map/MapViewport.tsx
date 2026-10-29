'use client';

import type { RefObject } from 'react';
import type { MapCapabilities, MapInspection } from '@ecosuitability/contracts';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from '@ecosuitability/ui';
import { Crosshair, Focus, Layers3, LocateFixed, PanelRightClose, X } from 'lucide-react';
import { MapInspector } from './MapInspector';
import { MapLayerPanel } from './MapLayerPanel';

type Coordinates = { longitude: number; latitude: number };

type MapViewportProps = {
  container: RefObject<HTMLDivElement | null>;
  coordinateOutputRef: RefObject<HTMLSpanElement | null>;
  capabilities: MapCapabilities;
  basemap?: MapCapabilities['basemaps'][number];
  selectedBasemap?: string;
  activeLayers: Set<string>;
  opacity: number;
  terrainEnabled: boolean;
  inspection?: MapInspection;
  inspectionCoordinates?: Coordinates;
  inspectorOpen: boolean;
  mapLoading: boolean;
  mapError?: string;
  inspectionLoading: boolean;
  inspectionError?: string;
  onBasemapChange: (basemapId: string) => void;
  onLayerChange: (layerId: string, enabled: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  onTerrainToggle: () => void;
  onInspectorOpenChange: (open: boolean) => void;
  onInspectRetry: (coordinates: Coordinates) => void;
  onReset: (resetBearing: boolean) => void;
};

export const MapViewport: React.FC<MapViewportProps> = ({
  container,
  coordinateOutputRef,
  capabilities,
  basemap,
  selectedBasemap,
  activeLayers,
  opacity,
  terrainEnabled,
  inspection,
  inspectionCoordinates,
  inspectorOpen,
  mapLoading,
  mapError,
  inspectionLoading,
  inspectionError,
  onBasemapChange,
  onLayerChange,
  onOpacityChange,
  onTerrainToggle,
  onInspectorOpenChange,
  onInspectRetry,
  onReset,
}) => (
  <div className="grid h-full min-h-0 lg:grid-cols-[18rem_1fr_20rem]">
    <aside className="hidden border-r border-border bg-surface p-5 lg:block">
      <MapLayerPanel
        capabilities={capabilities}
        selectedBasemap={selectedBasemap}
        activeLayers={activeLayers}
        opacity={opacity}
        terrainEnabled={terrainEnabled}
        onBasemapChange={onBasemapChange}
        onLayerChange={onLayerChange}
        onOpacityChange={onOpacityChange}
        onTerrainToggle={onTerrainToggle}
      />
    </aside>
    <div className="relative min-h-[65vh] bg-muted lg:min-h-0">
      <div ref={container} className="absolute inset-0" />
      {mapLoading ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-surface/80 text-sm text-muted-foreground">
          Loading authenticated map layers…
        </div>
      ) : null}
      {mapError ? (
        <Alert className="absolute left-3 right-3 top-3 z-20" variant="destructive">
          {mapError}
          <Button
            className="ml-3"
            size="sm"
            variant="secondary"
            onClick={() => window.location.reload()}
          >
            Retry map
          </Button>
        </Alert>
      ) : null}
      {inspectionLoading ? (
        <div className="absolute bottom-12 left-3 rounded bg-surface px-3 py-2 text-xs shadow">
          Inspecting point…
        </div>
      ) : null}
      {inspectionError ? (
        <Alert className="absolute bottom-12 left-3 max-w-sm" variant="destructive">
          {inspectionError}
          {inspectionCoordinates ? (
            <Button
              className="ml-3"
              size="sm"
              variant="secondary"
              onClick={() => onInspectRetry(inspectionCoordinates)}
            >
              Retry
            </Button>
          ) : null}
        </Alert>
      ) : null}
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
              capabilities={capabilities}
              selectedBasemap={selectedBasemap}
              activeLayers={activeLayers}
              opacity={opacity}
              terrainEnabled={terrainEnabled}
              onBasemapChange={onBasemapChange}
              onLayerChange={onLayerChange}
              onOpacityChange={onOpacityChange}
              onTerrainToggle={onTerrainToggle}
            />
          </SheetContent>
        </Dialog>
        <Dialog open={inspectorOpen} onOpenChange={onInspectorOpenChange}>
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
          onClick={() => onReset(false)}
        >
          <Focus size={16} />
        </Button>
        <Button
          aria-label="Reset map view"
          size="sm"
          variant="secondary"
          onClick={() => onReset(true)}
        >
          <LocateFixed size={16} />
        </Button>
      </div>
      <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 rounded bg-surface/90 px-2 py-1 text-[11px] text-muted-foreground shadow">
        <Crosshair className="mr-1 inline" size={12} />
        <span ref={coordinateOutputRef}>Select the map to inspect a pixel</span>
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
);
