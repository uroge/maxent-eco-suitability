import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { DownloadsScreen } from '@/features/results/DownloadsScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function DownloadsPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, { area: 'results' })) ? (
    <DownloadsScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
