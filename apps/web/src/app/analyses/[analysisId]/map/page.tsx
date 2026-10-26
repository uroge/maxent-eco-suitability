import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { MapScreen } from '@/features/map/MapScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function MapPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  return (await analysisRoute(analysisId, { area: 'results' })) ? (
    <MapScreen analysisId={analysisId} />
  ) : (
    <AnalysisUnavailable />
  );
}
