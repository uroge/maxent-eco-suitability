'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { analysisInputProfileResponseSchema } from '@ecosuitability/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ecosuitability/ui';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { SetupShell } from './SetupShell';

export const ValidationScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const profile = useQuery({
    queryKey: analysisKeys.profile(analysisId),
    queryFn: async () => {
      const response = await api.request(`/v1/analyses/${analysisId}/input-profile`);
      if (response.status === 404) {
        const created = await api.request(`/v1/analyses/${analysisId}/input-profile`, {
          method: 'POST',
        });
        if (!created.ok) {
          throw new Error('REQUEST_FAILED');
        }
        return analysisInputProfileResponseSchema.parse(await created.json());
      }
      if (!response.ok) {
        throw new Error('REQUEST_FAILED');
      }
      return analysisInputProfileResponseSchema.parse(await response.json());
    },
    refetchInterval: (query) =>
      ['queued', 'running'].includes(query.state.data?.profile.status ?? '') ? 1_500 : false,
  });
  const value = profile.data?.profile;
  return (
    <SetupShell
      analysisId={analysisId}
      current="validation"
      title="Validate source data"
      description="Profiling inspects source structure, coordinate candidates, projection, grids, coverage, and a simplified spatial preview before model choices are applied."
    >
      {!value || ['queued', 'running'].includes(value.status) ? (
        <Card className="p-8">
          <div className="flex items-center gap-3">
            <LoaderCircle className="animate-spin text-primary" />
            <div>
              <h2 className="font-semibold">Profiling inputs</h2>
              <p className="text-sm text-muted-foreground">
                This bounded worker job may wait behind another analysis.
              </p>
            </div>
          </div>
          <Progress className="mt-5" value={value?.progress ?? 0} />
        </Card>
      ) : null}
      {value ? (
        <div className="space-y-6">
          {value.warnings.map((warning) => (
            <Alert variant="warning" key={warning}>
              {warning}
            </Alert>
          ))}
          {value.blockers.length ? (
            <Alert variant="information">
              <strong>Configuration required.</strong> {value.blockers.join(' ')}
            </Alert>
          ) : null}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-5">
              <h2 className="font-semibold">Input checks</h2>
              <Badge variant={value.status === 'passed' ? 'success' : 'warning'}>
                {value.status}
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {value.checks.map((check) => (
                  <TableRow key={check.id}>
                    <TableCell className="font-medium">{check.label}</TableCell>
                    <TableCell>
                      {check.status === 'passed' ? (
                        <CheckCircle2 className="text-success" size={18} />
                      ) : (
                        <CircleAlert className="text-warning" size={18} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{check.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {value.rasters.length ? (
            <Card className="p-5">
              <h2 className="font-semibold">Raster metadata</h2>
              <pre className="mt-3 overflow-auto font-mono text-xs text-muted-foreground">
                {JSON.stringify(value.rasters, null, 2)}
              </pre>
            </Card>
          ) : null}
        </div>
      ) : null}
      <div className="mt-8 flex justify-between">
        <Button asChild variant="secondary">
          <Link href={`/analyses/${analysisId}/setup/data`}>Edit data</Link>
        </Button>
        <Button asChild disabled={!value || ['queued', 'running', 'failed'].includes(value.status)}>
          <Link href={`/analyses/${analysisId}/setup/configuration`}>Configure analysis</Link>
        </Button>
      </div>
    </SetupShell>
  );
};
