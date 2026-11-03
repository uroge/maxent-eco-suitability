import { BrandedLoading } from '@ecosuitability/ui';

export default function NewAnalysisLoading() {
  return (
    <main className="w-full">
      <BrandedLoading
        description="Setting up a secure draft for your occurrence and environmental data."
        label="Preparing workspace…"
        layout="full-page"
      />
    </main>
  );
}
