import { Skeleton } from '@ecosuitability/ui';

export const AnalysisLoading: React.FC = () => (
  <main className="mx-auto w-full max-w-6xl space-y-5 px-6 py-10">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-72 w-full" />
  </main>
);
