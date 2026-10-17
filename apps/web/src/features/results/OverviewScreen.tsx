'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  analysisDiagnosticsResponseSchema,
  analysisResultOverviewResponseSchema,
} from '@ecosuitability/contracts';
import { Button, Card, Skeleton } from '@ecosuitability/ui';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { ResultsShell } from './ResultsShell';

const metric = (value: number): string => value.toFixed(3);

export const OverviewScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const overview = useQuery({
    queryKey: analysisKeys.overview(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/results/overview`, analysisResultOverviewResponseSchema),
  });
  const diagnostics = useQuery({
    queryKey: analysisKeys.diagnostics(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/results/diagnostics`, analysisDiagnosticsResponseSchema),
  });
  const value = overview.data?.overview;
  const importance = diagnostics.data?.diagnostics.importance as
    { variables?: Array<{ variable: string; percent: number }> } | undefined;
  return (
    <ResultsShell analysisId={analysisId} current="overview">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {!value ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {value.displayName ?? value.configuration.speciesName}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Completed {new Date(value.completedAt).toLocaleString()} · expires{' '}
                  {new Date(value.resultExpiresAt).toLocaleString()}
                </p>
              </div>
              <Button asChild>
                <Link href={`/analyses/${analysisId}/map`}>Explore map</Link>
              </Button>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Mean AUC</p>
                <p className="mt-2 font-mono text-3xl font-semibold">
                  {metric(value.metrics.auc.mean)}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  AUC standard deviation
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold">
                  {metric(value.metrics.auc.standardDeviation)}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Threshold</p>
                <p className="mt-2 font-mono text-3xl font-semibold">
                  {metric(value.metrics.threshold.threshold)}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Accepted occurrences
                </p>
                <p className="mt-2 font-mono text-3xl font-semibold">
                  {value.validation.acceptedOccurrences}
                </p>
              </Card>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Card className="p-6">
                <h2 className="font-semibold">Variable importance</h2>
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={importance?.variables ?? []}
                      layout="vertical"
                      margin={{ left: 20 }}
                    >
                      <CartesianGrid stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" unit="%" />
                      <YAxis dataKey="variable" type="category" width={100} />
                      <Tooltip />
                      <Bar dataKey="percent" fill="var(--suitability-2)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-6">
                <h2 className="font-semibold">Frozen configuration</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Evaluation</dt>
                    <dd>
                      {value.metrics.method === 'k-fold'
                        ? `${value.metrics.folds} folds`
                        : 'Held-out train/test split'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Background points</dt>
                    <dd>{value.configuration.background.pointCount.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Regularization</dt>
                    <dd>{value.configuration.model.regularizationMultiplier}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Seed</dt>
                    <dd className="font-mono">{value.configuration.seed}</dd>
                  </div>
                </dl>
              </Card>
            </div>
          </>
        )}
      </div>
    </ResultsShell>
  );
};
