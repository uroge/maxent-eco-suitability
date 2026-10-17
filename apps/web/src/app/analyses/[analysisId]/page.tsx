import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { OverviewScreen } from '@/features/results/OverviewScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function ResultsPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, 'results')) ? (
    <OverviewScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
