import type { MapInspection } from '@ecosuitability/contracts';

type MapInspectorProps = { inspection: MapInspection | undefined };

export const MapInspector: React.FC<MapInspectorProps> = ({ inspection }) => (
  <div>
    <h2 className="font-semibold">Point inspector</h2>
    {inspection ? (
      <dl className="mt-5 space-y-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Coordinates</dt>
          <dd className="font-mono">
            {inspection.longitude.toFixed(5)}, {inspection.latitude.toFixed(5)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Suitability</dt>
          <dd className="font-mono text-xl">{inspection.suitability?.toFixed(4) ?? 'No data'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Threshold class</dt>
          <dd>
            {inspection.thresholdClass === null
              ? 'No data'
              : inspection.thresholdClass === 1
                ? 'Suitable'
                : 'Below threshold'}
          </dd>
        </div>
        {Object.entries(inspection.predictors).map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono">
              {typeof value === 'number' ? value.toPrecision(6) : (value ?? 'No data')}
            </dd>
          </div>
        ))}
        <div>
          <dt className="text-muted-foreground">Nearest occurrence</dt>
          <dd>
            {inspection.nearestOccurrenceMetres === null
              ? 'No occurrences'
              : `${inspection.nearestOccurrenceMetres.toFixed(0)} m`}
          </dd>
        </div>
      </dl>
    ) : (
      <p className="mt-3 text-sm text-muted-foreground">
        Choose a location to inspect every published raster and the nearest occurrence.
      </p>
    )}
  </div>
);
