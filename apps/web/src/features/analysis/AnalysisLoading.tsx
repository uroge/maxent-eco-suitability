import { BrandedLoading } from '@ecosuitability/ui';

export const AnalysisLoading: React.FC = () => (
  <main className="w-full">
    <BrandedLoading
      description="Retrieving the latest status, configuration, and result metadata."
      label="Loading analysis…"
      layout="full-page"
    />
  </main>
);
