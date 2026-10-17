import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@ecosuitability/ui';

const sections = [
  ['', 'Overview'],
  ['/map', 'Map'],
  ['/diagnostics', 'Diagnostics'],
  ['/downloads', 'Downloads'],
] as const;

export const ResultsShell: React.FC<{
  analysisId: string;
  current: string;
  children: ReactNode;
}> = ({ analysisId, children, current }) => (
  <main className="min-h-[calc(100vh-var(--header-height))] bg-background">
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Analysis results
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{analysisId}</p>
        </div>
        <nav aria-label="Result sections" className="flex overflow-x-auto">
          {sections.map(([suffix, label]) => (
            <Link
              key={label}
              href={`/analyses/${analysisId}${suffix}`}
              className={cn(
                'flex min-h-10 shrink-0 items-center border-b-2 border-transparent px-4 text-sm font-medium text-muted-foreground',
                current === label.toLowerCase() && 'border-primary text-foreground'
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
    {children}
  </main>
);
