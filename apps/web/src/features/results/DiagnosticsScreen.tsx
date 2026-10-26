'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { analysisDiagnosticsResponseSchema } from '@ecosuitability/contracts';
import { Skeleton, cn } from '@ecosuitability/ui';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import {
  EvaluationDiagnostics,
  ImportanceDiagnostics,
  ResponseDiagnostics,
} from './DiagnosticPanels';
import { ResultsShell } from './ResultsShell';

type Tab = 'evaluation' | 'importance' | 'responses';

export const DiagnosticsScreen: React.FC<{ analysisId: string; tab: Tab }> = ({
  analysisId,
  tab,
}) => {
  const api = useAnalysisApi();
  const query = useQuery({
    queryKey: analysisKeys.diagnostics(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/results/diagnostics`, analysisDiagnosticsResponseSchema),
  });
  const value = query.data?.diagnostics;

  return (
    <ResultsShell analysisId={analysisId} current="diagnostics">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Diagnostics</h1>
        <nav className="mt-6 flex border-b border-border" aria-label="Diagnostic views">
          {(['evaluation', 'importance', 'responses'] as const).map((item) => (
            <Link
              key={item}
              href={`/analyses/${analysisId}/diagnostics?tab=${item}`}
              aria-current={item === tab ? 'page' : undefined}
              className={cn(
                'min-h-10 border-b-2 border-transparent px-4 py-2 text-sm capitalize text-muted-foreground',
                item === tab && 'border-primary text-foreground'
              )}
            >
              {item}
            </Link>
          ))}
        </nav>
        {query.isPending ? <Skeleton className="mt-6 h-80 w-full" /> : null}
        {query.isError ? (
          <div className="mt-6">
            <QueryStateAlert
              error={query.error}
              title="Diagnostics unavailable"
              onRetry={() => void query.refetch()}
            />
          </div>
        ) : null}
        {value && tab === 'evaluation' ? <EvaluationDiagnostics metrics={value.metrics} /> : null}
        {value && tab === 'importance' ? (
          <ImportanceDiagnostics importance={value.importance} />
        ) : null}
        {value && tab === 'responses' ? (
          <ResponseDiagnostics curves={value.responseCurves} />
        ) : null}
      </div>
    </ResultsShell>
  );
};
