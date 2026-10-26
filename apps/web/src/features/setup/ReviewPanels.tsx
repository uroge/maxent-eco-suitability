import Link from 'next/link';
import type {
  AnalysisConfigurationResponse,
  AnalysisInputManifestResponse,
  AnalysisInputProfileResponse,
  AnalysisPreflight,
} from '@ecosuitability/contracts';
import { Alert, Badge, Button, Card, Progress } from '@ecosuitability/ui';

const list = (values: string[]): string => values.join(', ') || 'None';

type ReviewSummaryPanelsProps = {
  analysisId: string;
  inputRevision?: number;
  inputs?: AnalysisInputManifestResponse;
  profile?: AnalysisInputProfileResponse;
  configuration?: AnalysisConfigurationResponse;
};

export const ReviewSummaryPanels: React.FC<ReviewSummaryPanelsProps> = ({
  analysisId,
  inputRevision,
  inputs,
  profile,
  configuration,
}) => {
  const config = configuration?.configuration;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex justify-between gap-3">
          <h2 className="font-semibold">Inputs and occurrence profile</h2>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/analyses/${analysisId}/setup/data`}>Edit</Link>
          </Button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Input revision</dt>
            <dd>{inputRevision ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Datasets</dt>
            <dd>{inputs?.inputs.datasets.length ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Occurrence records</dt>
            <dd>{profile?.profile.occurrence.recordCount ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Duplicates reported</dt>
            <dd>{profile?.profile.occurrence.duplicateCoordinateCount ?? 'Pending mapping'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Occurrence CRS</dt>
            <dd className="font-mono text-xs">{profile?.profile.occurrence.crs ?? 'Unknown'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Predictor files</dt>
            <dd>
              {list(
                inputs?.inputs.datasets
                  .filter((entry) => entry.dataset.kind === 'predictor')
                  .flatMap((entry) => entry.files.map((file) => file.originalName)) ?? []
              )}
            </dd>
          </div>
        </dl>
      </Card>
      <Card className="p-6">
        <div className="flex justify-between gap-3">
          <h2 className="font-semibold">Configuration</h2>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/analyses/${analysisId}/setup/configuration`}>Edit</Link>
          </Button>
        </div>
        {config ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Species</dt>
              <dd>{config.speciesName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Revision</dt>
              <dd>{configuration.revision}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Predictors</dt>
              <dd>{config.predictors.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Types</dt>
              <dd>{list(config.predictors.map((item) => `${item.variableName}: ${item.type}`))}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Study area</dt>
              <dd>Predictor intersection</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Background</dt>
              <dd>{config.background.pointCount.toLocaleString()} random points</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Coordinates</dt>
              <dd>{config.inputValidation?.coordinatePolicy ?? 'reject-all'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Coverage</dt>
              <dd>
                {config.inputValidation?.coveragePolicy ?? 'require-all'} ·{' '}
                {config.inputValidation?.minimumCoveragePercent ?? 100}%
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Features</dt>
              <dd>{list(config.model.featureClasses)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Regularization</dt>
              <dd>{config.model.regularizationMultiplier}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Evaluation</dt>
              <dd>
                {config.validation.method === 'k-fold'
                  ? `${config.validation.folds} folds`
                  : `${Math.round(config.validation.testFraction * 100)}% held out`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seed</dt>
              <dd className="font-mono">{config.seed}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Terrain</dt>
              <dd>
                {config.visualization.terrain
                  ? `Elevation dataset ${config.visualization.terrain.datasetId}, metres`
                  : 'Disabled'}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Loading configuration…</p>
        )}
        <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
          {configuration?.fingerprint}
        </p>
      </Card>
    </div>
  );
};

type PreflightPanelProps = {
  analysisId: string;
  preflight?: AnalysisPreflight;
  stale: boolean;
  onRetry: () => void;
};

export const PreflightPanel: React.FC<PreflightPanelProps> = ({
  analysisId,
  preflight,
  stale,
  onRetry,
}) => (
  <Card className="mt-6 overflow-hidden">
    <div className="flex items-center justify-between border-b border-border p-6">
      <h2 className="font-semibold">Authoritative preflight</h2>
      {preflight ? (
        <Badge
          variant={
            preflight.status === 'passed'
              ? 'success'
              : preflight.status === 'blocked' || preflight.status === 'failed'
                ? 'error'
                : 'warning'
          }
        >
          {preflight.status}
        </Badge>
      ) : null}
    </div>
    {!preflight || ['queued', 'running'].includes(preflight.status) ? (
      <div className="p-6">
        <p className="mb-2 text-sm text-muted-foreground">Checking current revisions…</p>
        <Progress value={preflight?.progress ?? 0} />
      </div>
    ) : null}
    {stale ? (
      <Alert className="m-6" variant="warning">
        The displayed preflight is stale. A new check for the current revisions is being requested.
      </Alert>
    ) : null}
    {preflight?.checks.length ? (
      <ul className="divide-y divide-border">
        {preflight.checks.map((check) => (
          <li className="grid gap-1 p-4 sm:grid-cols-[12rem_7rem_1fr]" key={check.id}>
            <span className="font-medium">{check.label}</span>
            <span className="capitalize text-muted-foreground">{check.status}</span>
            <span className="text-sm text-muted-foreground">{check.message}</span>
          </li>
        ))}
      </ul>
    ) : null}
    {preflight?.warnings.map((warning) => (
      <Alert className="m-4" variant="warning" key={warning}>
        {warning}
      </Alert>
    ))}
    {preflight?.blockers.map((blocker) => (
      <Alert className="m-4" variant="destructive" key={blocker}>
        {blocker}{' '}
        <Link className="underline" href={`/analyses/${analysisId}/setup/configuration`}>
          Edit configuration
        </Link>
      </Alert>
    ))}
    {preflight?.status === 'failed' ? (
      <div className="p-4">
        <Button variant="secondary" onClick={onRetry}>
          Retry preflight
        </Button>
      </div>
    ) : null}
  </Card>
);
