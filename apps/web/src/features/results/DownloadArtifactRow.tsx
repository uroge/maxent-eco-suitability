import type { AnalysisArtifact } from '@ecosuitability/contracts';
import { Button, Card, ClipboardButton } from '@ecosuitability/ui';
import { Archive, Download, Loader2 } from 'lucide-react';

const descriptions: Record<AnalysisArtifact['kind'], string> = {
  'execution-summary': 'Frozen validation, runtime, and reproducibility summary',
  metrics: 'Evaluation runs, pooled ROC data, AUC, and threshold metrics',
  'variable-importance': 'Predictor importance and contribution values',
  'response-curves': 'Predictor response-curve data',
  'suitability-raster': 'Continuous suitability Cloud Optimized GeoTIFF',
  'suitability-threshold-raster': 'Threshold classification Cloud Optimized GeoTIFF',
  occurrences: 'Validated occurrence points in GeoJSON format',
  background: 'Model background points in GeoJSON format',
  'run-log': 'Analysis stage log',
  'result-bundle': 'All nine scientific artifacts plus bundle-manifest.json',
};

const bytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

type DownloadArtifactRowProps = {
  artifact: AnalysisArtifact;
  disabled: boolean;
  downloading: boolean;
  onDownload: (artifact: AnalysisArtifact) => void;
};

export const DownloadArtifactRow: React.FC<DownloadArtifactRowProps> = ({
  artifact,
  disabled,
  downloading,
  onDownload,
}) => {
  const bundle = artifact.kind === 'result-bundle';
  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {bundle ? <Archive aria-hidden="true" size={17} /> : null}
          <p className="font-medium">{artifact.filename}</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{descriptions[artifact.kind]}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {bytes(artifact.size)} · SHA-256 worker verified
        </p>
        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
          {artifact.sha256}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <ClipboardButton value={artifact.sha256} />
        <Button
          disabled={disabled}
          variant={bundle ? 'primary' : 'secondary'}
          onClick={() => onDownload(artifact)}
        >
          {downloading ? (
            <Loader2 className="animate-spin" aria-hidden="true" size={15} />
          ) : (
            <Download aria-hidden="true" size={15} />
          )}
          {bundle ? 'Download all' : 'Download'}
        </Button>
      </div>
    </Card>
  );
};
