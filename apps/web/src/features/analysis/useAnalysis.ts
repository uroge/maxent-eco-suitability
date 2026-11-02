'use client';

import { useQuery } from '@tanstack/react-query';
import { analysisResponseSchema } from '@ecosuitability/contracts';
import { analysisKeys, useAnalysisApi } from './api';

export const useAnalysis = (analysisId: string, polling = false) => {
  const api = useAnalysisApi();
  return useQuery({
    queryKey: analysisKeys.analysis(analysisId),
    queryFn: () => api.json(`/v1/analyses/${analysisId}`, analysisResponseSchema),
    refetchInterval: polling ? 2_000 : false,
  });
};
