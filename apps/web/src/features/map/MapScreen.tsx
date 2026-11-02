'use client';

import { useQuery } from '@tanstack/react-query';
import { mapCapabilitiesResponseSchema } from '@ecosuitability/contracts';
import { Skeleton } from '@ecosuitability/ui';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { MapWorkspace } from './MapWorkspace';

type MapScreenProps = {
  analysisId: string;
};

export const MapScreen: React.FC<MapScreenProps> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const capabilities = useQuery({
    queryKey: analysisKeys.map(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/map/capabilities`, mapCapabilitiesResponseSchema),
  });

  return (
    <div className="h-full min-h-0">
      {capabilities.isError ? (
        <div className="mx-auto max-w-4xl p-6">
          <QueryStateAlert
            error={capabilities.error}
            title="Map capabilities unavailable"
            onRetry={() => void capabilities.refetch()}
          />
        </div>
      ) : null}
      {capabilities.isPending ? <Skeleton className="m-6 h-[60vh]" /> : null}
      {capabilities.data ? (
        <MapWorkspace analysisId={analysisId} capabilities={capabilities.data.capabilities} />
      ) : null}
    </div>
  );
};
