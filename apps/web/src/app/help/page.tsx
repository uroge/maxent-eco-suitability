import { ContentPage } from '@/components/ContentPage';

export default function HelpPage() {
  return (
    <ContentPage
      eyebrow="Support"
      title="Preparing a successful analysis"
      intro="Most failures are caused by ambiguous occurrence fields, missing coordinate reference systems, incompatible raster grids, or insufficient predictor coverage."
    >
      <section>
        <h2 className="text-xl font-semibold">Before upload</h2>
        <p className="mt-2">
          Use one occurrence dataset, keep Shapefile components under one basename, and provide one
          predictor per GeoTIFF or ZIP. CSV and XLSX coordinates should use unambiguous numeric
          longitude and latitude fields.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">During setup</h2>
        <p className="mt-2">
          Warnings describe recoverable conditions. Blockers require a mapping or policy choice. If
          a file upload is interrupted, reselect the same local file: browsers do not restore file
          contents after refresh unless a retained file handle is available.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">After execution</h2>
        <p className="mt-2">
          Download important artifacts before the displayed expiry. Signed download URLs are
          short-lived; returning to Downloads creates a fresh URL while the 48-hour result record
          still exists.
        </p>
      </section>
    </ContentPage>
  );
}
