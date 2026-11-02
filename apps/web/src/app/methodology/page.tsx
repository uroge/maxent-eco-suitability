import { ContentPage } from '@/components/ContentPage';

export default function MethodologyPage() {
  return (
    <ContentPage
      eyebrow="Open methodology"
      title="How EcoSuitability works"
      intro="EcoSuitability validates one occurrence dataset and selected environmental rasters, then fits a deterministic maxnet model in an isolated R service."
    >
      <section>
        <h2 className="text-xl font-semibold">Inputs and validation</h2>
        <p className="mt-2">
          Occurrence records may be CSV, XLSX, GeoJSON, GeoPackage, or Shapefile components.
          Predictors are GeoTIFFs or ZIP archives containing one GeoTIFF. Profiling identifies
          source structure and potential mappings; a second preflight applies the final coordinate,
          coverage, raster-grid, and model policies. Exact duplicate coordinates are automatically
          and deterministically excluded.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Evaluation</h2>
        <p className="mt-2">
          Choose either one held-out train/test split or k-fold evaluation. Results report pooled
          held-out ROC points, per-run sample counts and AUC values, aggregate AUC statistics, and
          the maximum-sensitivity-plus-specificity threshold. AUC is not assigned a generic quality
          label because interpretation depends on sampling design and study context.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Outputs and limits</h2>
        <p className="mt-2">
          Outputs include execution provenance, metrics, permutation importance, response curves,
          continuous and threshold COG rasters, occurrence and background vectors, a run log, and a
          verified ZIP bundle. These are model products—not proof of presence, causal inference, or
          a substitute for domain review.
        </p>
      </section>
    </ContentPage>
  );
}
