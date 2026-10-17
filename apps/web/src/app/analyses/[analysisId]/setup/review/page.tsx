import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { ReviewScreen } from '@/features/setup/ReviewScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function ReviewPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, 'setup')) ? (
    <ReviewScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
