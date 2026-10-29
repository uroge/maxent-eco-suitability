import type { ReactNode } from 'react';
import { ResultsShell } from '@/features/results/ResultsShell';

export default async function ResultsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;

  return <ResultsShell analysisId={analysisId}>{children}</ResultsShell>;
}
