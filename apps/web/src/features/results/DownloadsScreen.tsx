'use client';

import { useQuery } from '@tanstack/react-query';
import {
  analysisArtifactDownloadResponseSchema,
  analysisResultManifestResponseSchema,
} from '@ecosuitability/contracts';
import { Alert, Button, Card, ClipboardButton } from '@ecosuitability/ui';
import { Download } from 'lucide-react';
import { analysisKeys, useAnalysisApi } from '../analysis/api';
import { ResultsShell } from './ResultsShell';

const bytes = (value: number): string =>
  value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;

export const DownloadsScreen: React.FC<{ analysisId: string }> = ({ analysisId }) => {
  const api = useAnalysisApi();
  const result = useQuery({
    queryKey: analysisKeys.results(analysisId),
    queryFn: () =>
      api.json(`/v1/analyses/${analysisId}/results`, analysisResultManifestResponseSchema),
  });
  const download = async (artifactId: string): Promise<void> => {
    const response = await api.json(
      `/v1/analyses/${analysisId}/results/${artifactId}/download`,
      analysisArtifactDownloadResponseSchema,
      { method: 'POST' }
    );
    window.location.assign(response.downloadUrl);
  };
  return (
    <ResultsShell analysisId={analysisId} current="downloads">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">Downloads</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verified artifacts and reproducibility metadata from the frozen execution snapshot.
        </p>
        {result.data ? (
          <>
            <Alert className="mt-6" variant="warning">
              Artifacts expire {new Date(result.data.result.resultExpiresAt).toLocaleString()}.
              Signed links are short-lived and refreshed each time you download.
            </Alert>
            <div className="mt-6 space-y-3">
              {[...result.data.result.artifacts]
                .sort(
                  (a, b) => Number(b.kind === 'result-bundle') - Number(a.kind === 'result-bundle')
                )
                .map((artifact) => (
                  <Card
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
                    key={artifact.id}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{artifact.filename}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {artifact.kind} · {bytes(artifact.size)}
                      </p>
                      <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                        SHA-256 {artifact.sha256}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ClipboardButton value={artifact.sha256} />
                      <Button
                        variant={artifact.kind === 'result-bundle' ? 'primary' : 'secondary'}
                        onClick={() => download(artifact.id)}
                      >
                        <Download size={15} />
                        Download
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          </>
        ) : null}
      </div>
    </ResultsShell>
  );
};
