import type { AnalysisInputProfile } from '@ecosuitability/contracts';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ecosuitability/ui';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { QueryStateAlert } from '../analysis/QueryStateAlert';
import { SpatialPreviewMap } from './SpatialPreviewMap';

const values = (items: string[]): string => (items.length ? items.join(', ') : 'None detected');

export const ValidationProfileResults: React.FC<{
  profile: AnalysisInputProfile;
  onRetry: () => void;
}> = ({ profile, onRetry }) => (
  <div className="space-y-6">
    {profile.status === 'failed' ? (
      <QueryStateAlert title="Profiling failed" onRetry={onRetry} />
    ) : null}
    {profile.warnings.map((warning) => (
      <Alert variant="warning" key={warning}>
        {warning}
      </Alert>
    ))}
    {profile.blockers.length ? (
      <Alert variant="information">
        <strong>Configuration required.</strong> {profile.blockers.join(' ')}
      </Alert>
    ) : null}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-semibold">Occurrence source</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Records</dt>
            <dd>{profile.occurrence.recordCount ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Duplicates</dt>
            <dd>{profile.occurrence.duplicateCoordinateCount ?? 'Pending mapping'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">CRS</dt>
            <dd className="font-mono text-xs">{profile.occurrence.crs ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sources</dt>
            <dd>{values(profile.occurrence.layers)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Columns</dt>
            <dd>{values(profile.occurrence.columns)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Longitude candidates</dt>
            <dd>{values(profile.occurrence.longitudeCandidates)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Latitude candidates</dt>
            <dd>{values(profile.occurrence.latitudeCandidates)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Species candidates</dt>
            <dd>{values(profile.occurrence.speciesCandidates)}</dd>
          </div>
        </dl>
      </Card>
      <Card className="p-5">
        <h2 className="font-semibold">Spatial preview</h2>
        <div className="mt-4">
          <SpatialPreviewMap preview={profile.spatialPreview} />
        </div>
      </Card>
    </div>
    {profile.occurrence.sources.length ? (
      <Card className="overflow-hidden">
        <div className="p-5">
          <h2 className="font-semibold">Occurrence source options</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every bounded worksheet or point layer available for Configuration.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Geometry</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Columns</TableHead>
                <TableHead>Longitude candidates</TableHead>
                <TableHead>Latitude candidates</TableHead>
                <TableHead>Species candidates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.occurrence.sources.map((source, index) => (
                <TableRow key={`${source.source ?? 'file'}-${index}`}>
                  <TableCell>{source.source ?? 'File'}</TableCell>
                  <TableCell>{source.geometryType ?? 'Tabular'}</TableCell>
                  <TableCell>{source.recordCount ?? 'Unknown'}</TableCell>
                  <TableCell>{values(source.columns)}</TableCell>
                  <TableCell>{values(source.longitudeCandidates)}</TableCell>
                  <TableCell>{values(source.latitudeCandidates)}</TableCell>
                  <TableCell>{values(source.speciesCandidates)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    ) : null}
    {profile.rasters.length ? (
      <Card className="overflow-hidden">
        <div className="p-5">
          <h2 className="font-semibold">Raster metadata</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead>CRS</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Nodata</TableHead>
                <TableHead>Aligned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profile.rasters.map((raster) => (
                <TableRow key={raster.datasetId}>
                  <TableCell className="font-mono text-xs">{raster.datasetId}</TableCell>
                  <TableCell className="max-w-48 truncate font-mono text-xs">
                    {raster.crs}
                  </TableCell>
                  <TableCell>
                    {raster.width} × {raster.height}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {raster.resolution.join(' × ')}
                  </TableCell>
                  <TableCell>{raster.nodata ?? 'None'}</TableCell>
                  <TableCell>{raster.alignedToReference ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    ) : (
      <EmptyState title="No raster metadata" description="No predictor raster could be profiled." />
    )}
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-5">
        <h2 className="font-semibold">Input checks</h2>
        <Badge variant={profile.status === 'passed' ? 'success' : 'warning'}>
          {profile.status}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profile.checks.map((check) => (
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
      </div>
    </Card>
  </div>
);
