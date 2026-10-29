'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  analysisDiagnosticsResponseSchema,
  analysisResultOverviewResponseSchema,
} from '@ecosuitability/contracts';
import {
  Button,
  Card,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ecosuitability/ui';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { ResultMapPreview } from './ResultMapPreview';

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
  const importance = diagnostics.data?.diagnostics.importance;
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {overview.isError ? (
        <QueryStateAlert
          error={overview.error}
          title="Result overview unavailable"
          onRetry={() => void overview.refetch()}
        />
      ) : null}
      {value ? (
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
          <div className="mt-7 overflow-hidden rounded-xl border border-border">
            <ResultMapPreview analysisId={analysisId} />
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
          <Card className="mt-6 p-6">
            <h2 className="font-semibold">Occurrence validation</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Accepted</dt>
                <dd className="font-mono text-xl">{value.validation.acceptedOccurrences}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Duplicates removed</dt>
                <dd className="font-mono text-xl">{value.validation.deduplicatedOccurrences}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Invalid coordinates</dt>
                <dd className="font-mono text-xl">
                  {value.validation.invalidCoordinateOccurrences}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Uncovered</dt>
                <dd className="font-mono text-xl">{value.validation.uncoveredOccurrences}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Coverage</dt>
                <dd className="font-mono text-xl">
                  {value.validation.coveragePercent.toFixed(1)}%
                </dd>
              </div>
            </dl>
          </Card>
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
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variable</TableHead>
                      <TableHead>Importance</TableHead>
                      <TableHead>Percent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importance?.variables.map((item) => (
                      <TableRow key={item.variable}>
                        <TableCell>{item.variable}</TableCell>
                        <TableCell>{item.importance.toFixed(4)}</TableCell>
                        <TableCell>{item.percent.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  <dt className="text-muted-foreground">Species</dt>
                  <dd>{value.configuration.speciesName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Occurrence source</dt>
                  <dd>{value.configuration.occurrence.format}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Predictors</dt>
                  <dd>
                    {value.configuration.predictors
                      .map((item) => `${item.variableName} (${item.type})`)
                      .join(', ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Study area</dt>
                  <dd>Predictor intersection</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Input policies</dt>
                  <dd>
                    {value.configuration.inputValidation?.coordinatePolicy ?? 'reject-all'} ·{' '}
                    {value.configuration.inputValidation?.coveragePolicy ?? 'require-all'} ·{' '}
                    {value.configuration.inputValidation?.minimumCoveragePercent ?? 100}%
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Feature classes</dt>
                  <dd>{value.configuration.model.featureClasses.join(', ')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Terrain</dt>
                  <dd>
                    {value.configuration.visualization.terrain
                      ? 'Requested from confirmed elevation predictor'
                      : 'Disabled'}
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
          {diagnostics.isError ? (
            <div className="mt-6">
              <QueryStateAlert
                error={diagnostics.error}
                title="Importance data unavailable"
                onRetry={() => void diagnostics.refetch()}
              />
            </div>
          ) : null}
        </>
      ) : !overview.isError ? (
        <Skeleton className="h-72 w-full" />
      ) : null}
    </div>
  );
};
