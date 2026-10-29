import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { AnalysisProviders } from './AnalysisProviders';

export default async function AnalysesLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return (
    <AnalysisProviders>
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <AppHeader />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </AnalysisProviders>
  );
}
