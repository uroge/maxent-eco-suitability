import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { ConfigurationScreen } from '@/features/setup/ConfigurationScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function ConfigurationPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, { area: 'setup', step: 'configuration' })) ? (
    <ConfigurationScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
