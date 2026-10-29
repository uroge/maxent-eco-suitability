'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { mapCapabilitiesResponseSchema } from '@ecosuitability/contracts';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import {
  installResultMapLayers,
  mapApiUrl,
  selectedResultMapStyle,
} from '../map/result-map-style';

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
      const activeLayers = new Set(
        value.layers
          .filter((layer) => layer.kind === 'suitability' || layer.kind === 'occurrences')
          .map((layer) => layer.id)
      );
      map = new maplibregl.Map({
        container: container.current,
        interactive: false,
        attributionControl: false,
        bounds: value.bounds,
        fitBoundsOptions: { padding: 24 },
        style: selectedResultMapStyle(
          value.basemaps[0],
          analysisId,
          value,
          activeLayers,
          0.85
        ),
        transformRequest: (url) =>
          url.startsWith(mapApiUrl) && token
            ? { url, headers: { Authorization: `Bearer ${token}` } }
            : { url },
      });
      map.on('style.load', () => {
        if (map) {
          installResultMapLayers(map, analysisId, value, activeLayers, 0.85, false);
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
