import { AnalysisUnavailable } from '@/features/analysis/AnalysisUnavailable';
import { DiagnosticsScreen } from '@/features/results/DiagnosticsScreen';
import { analysisRoute } from '@/lib/analysis-route';

export default async function DiagnosticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ analysisId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { analysisId } = await params;
  const { tab } = await searchParams;
  const selected = tab === 'importance' || tab === 'responses' ? tab : 'evaluation';
  return (await analysisRoute(analysisId, { area: 'results' })) ? (
    <DiagnosticsScreen analysisId={analysisId} tab={selected} />
  ) : (
    <AnalysisUnavailable />
  );
}
