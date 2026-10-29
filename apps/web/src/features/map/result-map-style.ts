import type { MapCapabilities } from '@ecosuitability/contracts';

export const mapApiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

const visualizationColors = (): {
  background: string;
  foreground: string;
  occurrence: string;
  backgroundPoint: string;
} => {
  const styles = getComputedStyle(document.documentElement);
  return {
    background: styles.getPropertyValue('--surface-subtle').trim(),
    foreground: styles.getPropertyValue('--foreground').trim(),
    occurrence: styles.getPropertyValue('--suitability-4').trim(),
    backgroundPoint: styles.getPropertyValue('--suitability-1').trim(),
  };
};

export const createResultMapStyle = (
  analysisId: string,
  capabilities: MapCapabilities,
  activeLayers: ReadonlySet<string>,
  opacity: number
): import('maplibre-gl').StyleSpecification => {
  const colors = visualizationColors();
  const style: import('maplibre-gl').StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': colors.background },
      },
    ],
  };
  for (const layer of capabilities.layers) {
    const sourceId = `source-${layer.id}`;
    const visibility = activeLayers.has(layer.id) ? 'visible' : 'none';
    if (layer.dataType === 'raster') {
      style.sources[sourceId] = {
        type: 'raster',
        tiles: [`${mapApiUrl}/v1/analyses/${analysisId}/map/tiles/${layer.id}/{z}/{x}/{y}`],
        tileSize: 256,
        bounds: capabilities.bounds,
      };
      style.layers.push({
        id: layer.id,
        source: sourceId,
        type: 'raster',
        layout: { visibility },
        paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
      });
    } else {
      style.sources[sourceId] = {
        type: 'geojson',
        data: `${mapApiUrl}/v1/analyses/${analysisId}/map/vectors/${layer.id}`,
      };
      style.layers.push({
        id: layer.id,
        source: sourceId,
        type: 'circle',
        layout: { visibility },
        paint: {
          'circle-radius': 4,
          'circle-color': layer.kind === 'occurrences' ? colors.occurrence : colors.backgroundPoint,
          'circle-stroke-color': colors.foreground,
          'circle-stroke-width': 1,
        },
      });
    }
  }
  if (capabilities.terrain.available) {
    style.sources['terrain-dem'] = {
      type: 'raster-dem',
      tiles: [`${mapApiUrl}/v1/analyses/${analysisId}/map/terrain/{z}/{x}/{y}`],
      tileSize: 256,
      encoding: 'mapbox',
      bounds: capabilities.bounds,
    };
  }
  return style;
};

export const selectedResultMapStyle = (
  basemap: MapCapabilities['basemaps'][number] | undefined,
  analysisId: string,
  capabilities: MapCapabilities,
  activeLayers: ReadonlySet<string>,
  opacity: number
): string | import('maplibre-gl').StyleSpecification => {
  const dark = document.documentElement.dataset.theme === 'dark';
  return (
    (dark ? basemap?.darkStyleUrl : null) ??
    basemap?.styleUrl ??
    createResultMapStyle(analysisId, capabilities, activeLayers, opacity)
  );
};

export const installResultMapLayers = (
  map: import('maplibre-gl').Map,
  analysisId: string,
  capabilities: MapCapabilities,
  activeLayers: ReadonlySet<string>,
  opacity: number,
  terrainEnabled: boolean
): void => {
  const colors = visualizationColors();
  for (const layer of capabilities.layers) {
    const sourceId = `source-${layer.id}`;
    const visibility = activeLayers.has(layer.id) ? 'visible' : 'none';
    if (layer.dataType === 'raster') {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [`${mapApiUrl}/v1/analyses/${analysisId}/map/tiles/${layer.id}/{z}/{x}/{y}`],
          tileSize: 256,
          bounds: capabilities.bounds,
        });
      }
      if (!map.getLayer(layer.id)) {
        map.addLayer({
          id: layer.id,
          source: sourceId,
          type: 'raster',
          layout: { visibility },
          paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
        });
      }
    } else {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: `${mapApiUrl}/v1/analyses/${analysisId}/map/vectors/${layer.id}`,
        });
      }
      if (!map.getLayer(layer.id)) {
        map.addLayer({
          id: layer.id,
          source: sourceId,
          type: 'circle',
          layout: { visibility },
          paint: {
            'circle-radius': 4,
            'circle-color':
              layer.kind === 'occurrences' ? colors.occurrence : colors.backgroundPoint,
            'circle-stroke-color': colors.foreground,
            'circle-stroke-width': 1,
          },
        });
      }
    }
    map.setLayoutProperty(layer.id, 'visibility', visibility);
  }
  if (capabilities.terrain.available && !map.getSource('terrain-dem')) {
    map.addSource('terrain-dem', {
      type: 'raster-dem',
      tiles: [`${mapApiUrl}/v1/analyses/${analysisId}/map/terrain/{z}/{x}/{y}`],
      tileSize: 256,
      encoding: 'mapbox',
      bounds: capabilities.bounds,
    });
  }
  if (terrainEnabled && map.getSource('terrain-dem')) {
    map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 });
  }
};
