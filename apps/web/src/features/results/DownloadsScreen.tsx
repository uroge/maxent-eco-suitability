'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  analysisArtifactDownloadResponseSchema,
  analysisResultManifestResponseSchema,
  type AnalysisArtifact,
} from '@ecosuitability/contracts';
import { Alert, Card, Skeleton } from '@ecosuitability/ui';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { DownloadArtifactRow } from './DownloadArtifactRow';
import { QueryStateAlert } from '../analysis/QueryStateAlert';

export const DownloadsScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const [downloadingId, setDownloadingId] = useState<string>();
  const [downloadError, setDownloadError] = useState<string>();
  const result = useQuery({
    queryKey: analysisKeys.results(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/results`, analysisResultManifestResponseSchema),
  });
  const manifest = result.data?.result;
  const [expiryReached, setExpiryReached] = useState(false);
  useEffect(() => {
    if (!manifest) {
      return;
    }
    const delay = Math.min(
      2_147_483_647,
      Math.max(0, new Date(manifest.resultExpiresAt).getTime() - Date.now())
    );
    const timeout = window.setTimeout(() => setExpiryReached(true), delay);
    return () => window.clearTimeout(timeout);
  }, [manifest]);
  const expired = manifest
    ? expiryReached || new Date(manifest.resultExpiresAt).getTime() <= result.dataUpdatedAt
    : false;
  const download = async (artifact: AnalysisArtifact): Promise<void> => {
    setDownloadingId(artifact.id);
    setDownloadError(undefined);
    try {
      const response = await api.json(
        `/v1/analyses/${analysisId}/results/${artifact.id}/download`,
        analysisArtifactDownloadResponseSchema,
        { method: 'POST' }
      );
      const anchor = document.createElement('a');
      anchor.href = response.downloadUrl;
      anchor.rel = 'noopener';
      anchor.click();
    } catch {
      setDownloadError(
        'The signed download link could not be created. Retry while the result is available.'
      );
    } finally {
      setDownloadingId(undefined);
    }
  };
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Downloads</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Verified artifacts and reproducibility metadata from the frozen execution snapshot.
      </p>
      {result.isPending ? <Skeleton className="mt-6 h-80 w-full" /> : null}
      {result.isError ? (
        <div className="mt-6">
          <QueryStateAlert
            error={result.error}
            title="Result manifest unavailable"
            onRetry={() => void result.refetch()}
          />
        </div>
      ) : null}
      {manifest ? (
        <>
          <Alert className="mt-6" variant={expired ? 'destructive' : 'warning'}>
            {expired
              ? 'These temporary artifacts have expired and can no longer be downloaded.'
              : `Download required files before ${new Date(
                  manifest.resultExpiresAt
                ).toLocaleString()}. A fresh short-lived signed link is created for every download.`}
          </Alert>
          {downloadError ? (
            <Alert className="mt-4" variant="destructive">
              {downloadError}
            </Alert>
          ) : null}
          <Card className="mt-6 p-5">
            <h2 className="font-semibold">Reproducibility</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Input revision</dt>
                <dd className="font-mono">{manifest.reproducibility.inputRevision}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Configuration revision</dt>
                <dd className="font-mono">{manifest.reproducibility.configurationRevision}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Random seed</dt>
                <dd className="font-mono">{manifest.reproducibility.seed}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Input fingerprint</dt>
                <dd className="break-all font-mono text-xs">
                  {manifest.reproducibility.inputFingerprint}
                </dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Configuration fingerprint</dt>
                <dd className="break-all font-mono text-xs">
                  {manifest.reproducibility.configurationFingerprint}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
              The ZIP contains the nine scientific files and a non-recursive bundle-manifest.json
              with these values and every artifact checksum.
            </p>
          </Card>
          <div className="mt-6 space-y-3">
            {[...manifest.artifacts]
              .sort(
                (a, b) => Number(b.kind === 'result-bundle') - Number(a.kind === 'result-bundle')
              )
              .map((artifact) => (
                <DownloadArtifactRow
                  key={artifact.id}
                  artifact={artifact}
                  disabled={expired || Boolean(downloadingId)}
                  downloading={downloadingId === artifact.id}
                  onDownload={download}
                />
              ))}
          </div>
        </>
      ) : null}
    </div>
  );
};
