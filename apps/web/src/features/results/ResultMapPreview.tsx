'use client';

import { useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQuery } from '@tanstack/react-query';
import { mapCapabilitiesResponseSchema, type MapCapabilities } from '@ecosuitability/contracts';
import { Alert, BrandedLoading } from '@ecosuitability/ui';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { useAuthenticatedMapRuntime } from '../map/useAuthenticatedMapRuntime';

const StaticResultMap: React.FC<{
  analysisId: string;
  capabilities: MapCapabilities;
}> = ({ analysisId, capabilities }) => {
  const { getToken } = useAuth();
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const activeLayersRef = useRef(
    new Set(
      capabilities.layers
        .filter((layer) => layer.kind === 'suitability' || layer.kind === 'occurrences')
        .map((layer) => layer.id)
    )
  );
  const opacityRef = useRef(0.85);
  const terrainRef = useRef(false);
  const { containerRef, state } = useAuthenticatedMapRuntime({
    activeLayersRef,
    analysisId,
    capabilities,
    fitPadding: 24,
    getToken,
    inspection: false,
    interactive: false,
    mapRef,
    navigationControls: false,
    opacityRef,
    terrainRef,
  });

  return (
    <div className="relative h-72 w-full bg-muted">
      <div
        ref={containerRef}
        aria-label="Suitability and occurrence map preview"
        className="absolute inset-0"
      />
      {state.status === 'loading' ? (
        <BrandedLoading
          className="absolute inset-0 bg-surface/85 py-4"
          label="Loading map preview…"
        />
      ) : null}
      {state.status === 'error' ? (
        <div className="absolute inset-x-4 top-4">
          <Alert variant="destructive">{state.error}</Alert>
        </div>
      ) : null}
    </div>
  );
};

export const ResultMapPreview: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const capabilities = useQuery({
    queryKey: analysisKeys.map(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/map/capabilities`, mapCapabilitiesResponseSchema),
  });

  if (capabilities.isError) {
    return (
      <QueryStateAlert
        error={capabilities.error}
        title="Map preview unavailable"
        onRetry={() => void capabilities.refetch()}
      />
    );
  }
  if (capabilities.isPending) {
    return (
      <div className="h-72 bg-muted">
        <BrandedLoading className="h-full py-4" label="Loading map preview…" />
      </div>
    );
  }
  return <StaticResultMap analysisId={analysisId} capabilities={capabilities.data.capabilities} />;
};
