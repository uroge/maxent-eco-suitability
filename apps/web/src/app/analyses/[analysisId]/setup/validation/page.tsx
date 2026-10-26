import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { ValidationScreen } from '@/features/setup/ValidationScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function ValidationPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, { area: 'setup', step: 'validation' })) ? (
    <ValidationScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
