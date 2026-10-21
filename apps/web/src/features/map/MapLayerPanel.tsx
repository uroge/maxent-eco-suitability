import type { MapCapabilities } from '@ecosuitability/contracts';
import { Alert, Button, Checkbox, Slider } from '@ecosuitability/ui';
import { Layers3 } from 'lucide-react';

type MapLayerPanelProps = {
  capabilities: MapCapabilities | undefined;
  selectedBasemap: string | undefined;
  activeLayers: ReadonlySet<string>;
  opacity: number;
  terrainEnabled: boolean;
  onBasemapChange: (basemapId: string) => void;
  onLayerChange: (layerId: string, enabled: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  onTerrainToggle: () => void;
};

export const MapLayerPanel: React.FC<MapLayerPanelProps> = ({
  capabilities,
  selectedBasemap,
  activeLayers,
  opacity,
  terrainEnabled,
  onBasemapChange,
  onLayerChange,
  onOpacityChange,
  onTerrainToggle,
}) => (
  <div>
    <h2 className="flex items-center gap-2 font-semibold">
      <Layers3 size={18} />
      Map layers
    </h2>
    {capabilities?.basemaps.length ? (
      <label className="mt-5 block text-sm font-medium">
        Basemap
        <select
          className="mt-2 min-h-10 w-full rounded-lg border border-border bg-surface px-3"
          value={selectedBasemap}
          onChange={(event) => onBasemapChange(event.target.value)}
        >
          {capabilities.basemaps.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    ) : null}
    <div className="mt-5 space-y-4">
      {capabilities?.layers.map((layer) => (
        <div key={layer.id}>
          <label className="flex min-h-10 items-center gap-3 text-sm">
            <Checkbox
              checked={activeLayers.has(layer.id)}
              onCheckedChange={(checked) => onLayerChange(layer.id, checked === true)}
            />
            {layer.label}
          </label>
          {activeLayers.has(layer.id) && layer.legend.length ? (
            <ul aria-label={`${layer.label} legend`} className="ml-8 mt-1 space-y-1">
              {layer.legend.map((entry) => (
                <li
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  key={`${entry.value}-${entry.label}`}
                >
                  <span
                    className="size-3 rounded-sm border border-border"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
    <label className="mt-6 block text-xs font-medium text-muted-foreground">Raster opacity</label>
    <Slider
      className="mt-2"
      min={0}
      max={1}
      step={0.05}
      value={[opacity]}
      onValueChange={([next]) => onOpacityChange(next ?? 0)}
    />
    <Alert className="mt-6" variant={capabilities?.terrain.available ? 'success' : 'information'}>
      {capabilities?.terrain.available
        ? '3D terrain is available.'
        : capabilities?.terrain.unavailableReason}
    </Alert>
    <Button
      className="mt-3 w-full"
      disabled={!capabilities?.terrain.available}
      variant="secondary"
      onClick={onTerrainToggle}
    >
      {terrainEnabled ? 'Return to 2D' : 'Enable 3D terrain'}
    </Button>
  </div>
);
