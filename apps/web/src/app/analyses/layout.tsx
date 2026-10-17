import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { AnalysisProviders } from './AnalysisProviders';

export default async function AnalysesLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return (
    <AnalysisProviders>
      <AppHeader />
      {children}
    </AnalysisProviders>
  );
}
