'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { mapCapabilitiesResponseSchema } from '@ecosuitability/contracts';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { analysisKeys, useAnalysisApi } from '../analysis/api';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

export const ResultMapPreview: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const { getToken } = useAuth();
  const container = useRef<HTMLDivElement>(null);
  const capabilities = useQuery({
    queryKey: [...analysisKeys.map(analysisId), 'preview'],
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/map/capabilities`, mapCapabilitiesResponseSchema),
  });

  useEffect(() => {
    const value = capabilities.data?.capabilities;
    if (!container.current || !value) {
      return;
    }
    let map: import('maplibre-gl').Map | undefined;
    let disposed = false;
    void Promise.all([import('maplibre-gl'), getToken()]).then(([maplibregl, token]) => {
      if (disposed || !container.current) {
        return;
      }
      const styles = getComputedStyle(document.documentElement);
      const basemap = value.basemaps[0];
      map = new maplibregl.Map({
        container: container.current,
        interactive: false,
        attributionControl: false,
        bounds: value.bounds,
        fitBoundsOptions: { padding: 24 },
        style: basemap?.styleUrl ?? {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': styles.getPropertyValue('--surface-subtle').trim() },
            },
          ],
        },
        transformRequest: (url) =>
          url.startsWith(apiUrl) && token
            ? { url, headers: { Authorization: `Bearer ${token}` } }
            : { url },
      });
      map.on('load', () => {
        for (const layer of value.layers.filter(
          (item) => item.kind === 'suitability' || item.kind === 'occurrences'
        )) {
          const source = `preview-${layer.id}`;
          if (layer.dataType === 'raster') {
            map?.addSource(source, {
              type: 'raster',
              tiles: [`${apiUrl}/v1/analyses/${analysisId}/map/tiles/${layer.id}/{z}/{x}/{y}`],
              tileSize: 256,
            });
            map?.addLayer({
              id: source,
              source,
              type: 'raster',
              paint: { 'raster-opacity': 0.85 },
            });
          } else {
            map?.addSource(source, {
              type: 'geojson',
              data: `${apiUrl}/v1/analyses/${analysisId}/map/vectors/${layer.id}`,
            });
            map?.addLayer({
              id: source,
              source,
              type: 'circle',
              paint: {
                'circle-radius': 3,
                'circle-color': styles.getPropertyValue('--suitability-4').trim(),
                'circle-stroke-color': styles.getPropertyValue('--foreground').trim(),
                'circle-stroke-width': 1,
              },
            });
          }
        }
      });
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [analysisId, capabilities.data, getToken]);

  if (capabilities.isError) {
    return (
      <QueryStateAlert
        error={capabilities.error}
        title="Map preview unavailable"
        onRetry={() => void capabilities.refetch()}
      />
    );
  }
  return (
    <div className="relative h-72 w-full bg-muted">
      <div
        ref={container}
        className="absolute inset-0"
        aria-label="Suitability and occurrence map preview"
      />
      {capabilities.isPending ? (
        <div className="absolute inset-0 grid place-items-center bg-surface/80 text-sm text-muted-foreground">
          Loading map preview…
        </div>
      ) : null}
    </div>
  );
};
