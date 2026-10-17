'use client';

import { Alert, Button } from '@ecosuitability/ui';

export default function NewAnalysisError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <Alert variant="destructive">
        <h1 className="font-semibold">Unable to create the draft</h1>
        <p className="mt-1">The API is temporarily unavailable. No analysis was queued.</p>
        <Button className="mt-4" onClick={reset}>
          Try again
        </Button>
      </Alert>
    </main>
  );
}
