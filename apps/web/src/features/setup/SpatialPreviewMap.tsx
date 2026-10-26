'use client';

import { useEffect, useRef } from 'react';
import type { AnalysisInputProfile } from '@ecosuitability/contracts';

type SpatialPreviewMapProps = {
  preview: AnalysisInputProfile['spatialPreview'];
};

type PreviewPoint = {
  geometry?: { type?: unknown; coordinates?: unknown };
};

export const SpatialPreviewMap: React.FC<SpatialPreviewMapProps> = ({ preview }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || !preview?.features.length) {
      return;
    }
    let map: import('maplibre-gl').Map | undefined;
    let disposed = false;
    void import('maplibre-gl').then((maplibregl) => {
      if (disposed || !container.current) {
        return;
      }
      const styles = getComputedStyle(document.documentElement);
      map = new maplibregl.Map({
        container: container.current,
        interactive: false,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            preview: {
              type: 'geojson',
              data: preview as import('maplibre-gl').GeoJSONSourceSpecification['data'],
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': styles.getPropertyValue('--surface-subtle').trim() },
            },
            {
              id: 'occurrences',
              source: 'preview',
              type: 'circle',
              paint: {
                'circle-color': styles.getPropertyValue('--suitability-3').trim(),
                'circle-radius': 4,
                'circle-stroke-color': styles.getPropertyValue('--foreground').trim(),
                'circle-stroke-width': 1,
              },
            },
          ],
        },
      });
      const bounds = new maplibregl.LngLatBounds();
      for (const feature of preview.features) {
        const candidate = feature as PreviewPoint;
        if (
          candidate.geometry?.type === 'Point' &&
          Array.isArray(candidate.geometry.coordinates) &&
          candidate.geometry.coordinates.length >= 2 &&
          candidate.geometry.coordinates.every((coordinate) => typeof coordinate === 'number')
        ) {
          bounds.extend(candidate.geometry.coordinates as [number, number]);
        }
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 32, maxZoom: 8, duration: 0 });
      }
    });
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [preview]);

  if (!preview?.features.length) {
    return (
      <p className="text-sm text-muted-foreground">
        A spatial preview is unavailable until an unambiguous coordinate mapping can be detected.
      </p>
    );
  }
  return (
    <div
      ref={container}
      className="h-64 overflow-hidden rounded-lg"
      aria-label="Occurrence spatial preview"
    />
  );
};
