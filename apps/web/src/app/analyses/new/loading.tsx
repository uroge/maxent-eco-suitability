import { Skeleton } from '@ecosuitability/ui';

export default function NewAnalysisLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <Skeleton className="h-32 w-full" />
    </main>
  );
}
