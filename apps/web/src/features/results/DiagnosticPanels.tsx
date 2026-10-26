'use client';

import { useState } from 'react';
import type { AnalysisDiagnostics } from '@ecosuitability/contracts';
import {
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

export const EvaluationDiagnostics: React.FC<{
  metrics: AnalysisDiagnostics['metrics'];
}> = ({ metrics }) => (
  <div className="mt-6 space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: 'Mean AUC', metric: metrics.auc.mean },
        { label: 'AUC standard deviation', metric: metrics.auc.standardDeviation },
        { label: 'Minimum AUC', metric: metrics.auc.minimum },
        { label: 'Maximum AUC', metric: metrics.auc.maximum },
      ].map(({ label, metric }) => (
        <Card className="p-5" key={label}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold">{metric.toFixed(3)}</p>
        </Card>
      ))}
    </div>
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="p-6">
        <h2 className="font-semibold">Pooled held-out ROC</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.pooledRoc}>
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
            AUC is shown without a generic quality label; interpretation depends on sampling design
            and study context.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>AUC</TableHead>
              <TableHead>Presence</TableHead>
              <TableHead>Background</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.evaluationRuns.map((run) => (
              <TableRow key={run.run}>
                <TableCell>{run.run}</TableCell>
                <TableCell className="font-mono">{run.auc.toFixed(3)}</TableCell>
                <TableCell>{run.presenceCount}</TableCell>
                <TableCell>{run.backgroundCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
    <Card className="overflow-hidden">
      <div className="p-5">
        <h2 className="font-semibold">Threshold and confusion metrics</h2>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Threshold</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead>Specificity</TableHead>
              <TableHead>True positive</TableHead>
              <TableHead>False negative</TableHead>
              <TableHead>True negative</TableHead>
              <TableHead>False positive</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{metrics.threshold.threshold.toFixed(4)}</TableCell>
              <TableCell>{metrics.threshold.sensitivity.toFixed(4)}</TableCell>
              <TableCell>{metrics.threshold.specificity.toFixed(4)}</TableCell>
              <TableCell>{metrics.threshold.truePositive}</TableCell>
              <TableCell>{metrics.threshold.falseNegative}</TableCell>
              <TableCell>{metrics.threshold.trueNegative}</TableCell>
              <TableCell>{metrics.threshold.falsePositive}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
    <Card className="overflow-hidden">
      <div className="p-5">
        <h2 className="font-semibold">Pooled ROC data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Held-out predictions used for threshold calculation.
        </p>
      </div>
      <div className="max-h-96 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>False-positive rate</TableHead>
              <TableHead>True-positive rate</TableHead>
              <TableHead>Threshold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.pooledRoc.map((point, index) => (
              <TableRow key={`${point.threshold}-${index}`}>
                <TableCell>{point.falsePositiveRate.toFixed(5)}</TableCell>
                <TableCell>{point.truePositiveRate.toFixed(5)}</TableCell>
                <TableCell>{point.threshold.toFixed(5)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  </div>
);

export const ImportanceDiagnostics: React.FC<{
  importance: AnalysisDiagnostics['importance'];
}> = ({ importance }) => (
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
);

export const ResponseDiagnostics: React.FC<{
  curves: AnalysisDiagnostics['responseCurves'];
}> = ({ curves }) => {
  const [selectedCurve, setSelectedCurve] = useState<string>();
  const activeCurve =
    curves.curves.find((curve) => curve.variable === selectedCurve) ?? curves.curves[0];
  if (!activeCurve) {
    return null;
  }
  const curveData = activeCurve.values.map((item, index) => ({
    value: item,
    suitability: activeCurve.suitability[index],
  }));
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">Response curve · {activeCurve.variable}</h2>
        <Select value={activeCurve.variable} onValueChange={setSelectedCurve}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Response curve predictor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {curves.curves.map((curve) => (
              <SelectItem key={curve.variable} value={curve.variable}>
                {curve.variable}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
          {curveData.map((item, index) => (
            <TableRow key={`${item.value}-${index}`}>
              <TableCell>{item.value}</TableCell>
              <TableCell>{item.suitability}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
