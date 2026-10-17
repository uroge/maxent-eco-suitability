'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { analysisDiagnosticsResponseSchema } from '@ecosuitability/contracts';
import {
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@ecosuitability/ui';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { ResultsShell } from './ResultsShell';

type Tab = 'evaluation' | 'importance' | 'responses';

type Importance = { variables: Array<{ variable: string; importance: number; percent: number }> };
type Curves = { curves: Array<{ variable: string; values: number[]; suitability: number[] }> };

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
  const importance = value?.importance as Importance | undefined;
  const curves = value?.responseCurves as Curves | undefined;
  const firstCurve = curves?.curves[0];
  const curveData =
    firstCurve?.values.map((item, index) => ({
      value: item,
      suitability: firstCurve.suitability[index],
    })) ?? [];
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
        {value && tab === 'evaluation' ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-6">
              <h2 className="font-semibold">Pooled held-out ROC</h2>
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={value.metrics.pooledRoc}>
                    <CartesianGrid stroke="var(--border)" />
                    <XAxis dataKey="falsePositiveRate" type="number" domain={[0, 1]} />
                    <YAxis dataKey="truePositiveRate" domain={[0, 1]} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="truePositiveRate"
                      stroke="var(--suitability-2)"
                      fill="var(--accent)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="overflow-hidden">
              <div className="p-5">
                <h2 className="font-semibold">Evaluation runs</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  AUC is shown without a generic quality label; interpretation depends on sampling
                  design and study context.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>AUC</TableHead>
                    <TableHead>Presence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {value.metrics.evaluationRuns.map((run) => (
                    <TableRow key={run.run}>
                      <TableCell>{run.run}</TableCell>
                      <TableCell className="font-mono">{run.auc.toFixed(3)}</TableCell>
                      <TableCell>{run.presenceCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        ) : null}
        {importance && tab === 'importance' ? (
          <Card className="mt-6 p-6">
            <h2 className="font-semibold">Permutation importance</h2>
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={importance.variables}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="variable" />
                  <YAxis unit="%" />
                  <Tooltip />
                  <Bar dataKey="percent" fill="var(--suitability-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variable</TableHead>
                  <TableHead>Importance</TableHead>
                  <TableHead>Percent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importance.variables.map((item) => (
                  <TableRow key={item.variable}>
                    <TableCell>{item.variable}</TableCell>
                    <TableCell>{item.importance.toFixed(4)}</TableCell>
                    <TableCell>{item.percent.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}
        {firstCurve && tab === 'responses' ? (
          <Card className="mt-6 p-6">
            <h2 className="font-semibold">Response curve · {firstCurve.variable}</h2>
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curveData}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="value" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <Line dataKey="suitability" stroke="var(--suitability-2)" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Predictor value</TableHead>
                  <TableHead>Suitability</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curveData.slice(0, 100).map((item, index) => (
                  <TableRow key={`${item.value}-${index}`}>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{item.suitability}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </ResultsShell>
  );
};
