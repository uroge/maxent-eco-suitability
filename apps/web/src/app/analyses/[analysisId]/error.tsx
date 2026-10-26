'use client';

import { Alert, Button } from '@ecosuitability/ui';

type AnalysisErrorPageProps = {
  reset: () => void;
};

export default function AnalysisErrorPage({ reset }: AnalysisErrorPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <Alert variant="destructive">
        <h1 className="text-lg font-semibold">Analysis service unavailable</h1>
        <p className="mt-2">
          The analysis could not be loaded. Its availability and ownership have not been inferred
          from this temporary service failure.
        </p>
        <Button className="mt-4" variant="secondary" onClick={reset}>
          Retry
        </Button>
      </Alert>
    </main>
  );
}
