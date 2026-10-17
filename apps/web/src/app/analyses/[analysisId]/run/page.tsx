import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { RunScreen } from '@/features/run/RunScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function RunPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, 'run')) ? (
    <RunScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
