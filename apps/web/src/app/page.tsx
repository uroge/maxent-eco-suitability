import Link from 'next/link';
import { Activity, ArrowRight, Check, Map, Upload } from 'lucide-react';
import { Badge, Button } from '@ecosuitability/ui';
import { AppHeader } from '@/components/AppHeader';
import { HeroSuitabilityMap } from '@/components/HeroSuitabilityMap';

const workflow = [
  {
    description: 'Provide one occurrence dataset and selected environmental GeoTIFF predictors.',
    icon: Upload,
    step: '01',
    title: 'Upload data',
  },
  {
    description: 'Validate inputs, configure maxnet, and run a deterministic suitability model.',
    icon: Activity,
    step: '02',
    title: 'Model suitability',
  },
  {
    description: 'Review a suitability map, diagnostics, response curves, and verified outputs.',
    icon: Map,
    step: '03',
    title: 'Explore results',
  },
];

const referenceSections = [
  {
    items: [
      'CSV, XLSX, GeoJSON, GPKG, or Shapefile occurrence data',
      'GeoTIFF environmental predictors',
      'ZIP archives containing one GeoTIFF predictor',
      'WGS 84 coordinates where applicable',
    ],
    title: 'Accepted formats',
  },
  {
    items: [
      'suitability.tif continuous raster output',
      'occurrences.geojson validated occurrence records',
      'metrics, variable importance, and response-curve JSON',
      'threshold raster, vectors, provenance, logs, and a verified ZIP bundle',
    ],
    title: 'Outputs',
  },
  {
    items: [
      'MaxEnt modelling via the R maxnet package',
      'Maximum sensitivity plus specificity threshold',
      'No silent reprojection or data modification',
      'Reproducible seed, IDs, and checksums',
    ],
    title: 'Methodology',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <AppHeader />
      <section className="grid lg:min-h-[32.5rem] lg:grid-cols-[44%_56%]">
        <div className="flex min-w-0 items-center bg-hero px-6 py-14 text-hero-foreground sm:px-10 lg:px-16 lg:py-16">
          <div className="max-w-[27.5rem]">
            <Badge variant="success">MaxEnt / maxnet · R · Open methodology</Badge>
            <h1 className="mt-3 text-[2.125rem] font-bold leading-tight tracking-tight sm:text-[2.375rem]">
              From species observations
              <br />
              to habitat suitability maps
            </h1>
            <p className="mt-5 text-[15px] leading-6 text-white/72">
              Upload species occurrence records and environmental rasters. EcoSuitability validates
              your data, fits a MaxEnt model with R maxnet, and delivers georeferenced suitability
              maps with reproducibility metadata.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="bg-surface text-primary hover:bg-background" size="lg">
                <Link href="/analyses/new">
                  <ArrowRight aria-hidden="true" size={17} />
                  Start analysis
                </Link>
              </Button>
              <Button
                asChild
                className="border-white/25 text-white hover:bg-white/10 hover:text-white"
                size="lg"
                variant="secondary"
              >
                <Link href="/analyses/new?example=1">Try example dataset</Link>
              </Button>
              <Button
                asChild
                className="text-white hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-hero"
                size="lg"
                variant="ghost"
              >
                <a href="#methodology">Explore methodology</a>
              </Button>
            </div>
            <p className="mt-8 text-xs text-white/45">
              Sign in to create, save, and run an analysis. Results remain available for 48 hours.
            </p>
          </div>
        </div>
        <div className="relative min-h-72 min-w-0 overflow-hidden bg-surface-subtle sm:min-h-96 lg:min-h-0">
          <HeroSuitabilityMap />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-r from-hero/35 to-transparent"
          />
        </div>
      </section>

      <section className="border-b border-border px-6 py-14 sm:px-10 lg:px-16">
        <p className="mb-8 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
          How it works
        </p>
        <div className="grid gap-8 lg:grid-cols-3">
          {workflow.map(({ description, icon: Icon, step, title }) => (
            <article className="flex min-w-0 gap-5" key={step}>
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Icon aria-hidden="true" size={24} />
              </span>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {step}
                </p>
                <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        id="methodology"
        className="grid divide-y divide-border border-b border-border lg:grid-cols-3 lg:divide-x lg:divide-y-0"
      >
        {referenceSections.map(({ items, title }) => (
          <article className="px-6 py-10 sm:px-10 lg:px-12" key={title}>
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
              {title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {items.map((item) => (
                <li className="flex items-start gap-2.5 text-sm text-foreground" key={item}>
                  <Check aria-hidden="true" className="mt-0.5 shrink-0 text-success" size={14} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <footer
        id="footer"
        className="flex flex-col gap-4 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-16"
      >
        <p>EcoSuitability — Species &amp; Environmental Suitability Analysis</p>
        <nav aria-label="Footer navigation" className="flex gap-5">
          <Link className="hover:text-foreground" href="/methodology">
            Methodology
          </Link>
          <Link className="hover:text-foreground" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            Terms
          </Link>
        </nav>
      </footer>
    </main>
  );
}
