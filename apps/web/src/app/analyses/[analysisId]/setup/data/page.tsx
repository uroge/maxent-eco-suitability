import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { DataScreen } from '@/features/setup/DataScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function DataPage({
  params,
  searchParams,
}: {
  params: Promise<{ analysisId: string }>;
  searchParams: Promise<{ example?: string }>;
}) {
  const { analysisId } = await params;
  const { example } = await searchParams;
  return (await analysisRoute(analysisId, { area: 'setup', step: 'data' })) ? (
    <DataScreen analysisId={analysisId} example={example === '1'} />
  ) : (
    <AnalysisUnavailable />
  );
}
