import Link from 'next/link';
import { Button, EmptyState } from '@ecosuitability/ui';

export const AnalysisUnavailable: React.FC = () => (
  <main className="mx-auto w-full max-w-3xl px-6 py-16">
    <EmptyState
      title="Analysis unavailable"
      description="This analysis is missing, expired, or belongs to another account. For privacy, those cases are presented identically."
    >
      <Button asChild>
        <Link href="/analyses/new">Start a new analysis</Link>
      </Button>
    </EmptyState>
  </main>
);
