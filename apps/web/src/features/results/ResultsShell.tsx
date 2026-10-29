'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Button,
  SheetContent,
  cn,
} from '@ecosuitability/ui';
import { Menu, X } from 'lucide-react';

const sections = [
  ['', 'Overview'],
  ['/map', 'Map'],
  ['/diagnostics', 'Diagnostics'],
  ['/downloads', 'Downloads'],
] as const;

export const ResultsShell: React.FC<{
  analysisId: string;
  children: ReactNode;
}> = ({ analysisId, children }) => {
  const pathname = usePathname();
  const basePath = `/analyses/${analysisId}`;
  const current =
    pathname === basePath ? 'overview' : pathname.slice(basePath.length + 1).split('/')[0];

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Analysis results
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{analysisId}</p>
          </div>
          <nav aria-label="Result sections" className="hidden overflow-x-auto sm:flex">
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
          <Dialog>
            <DialogTrigger asChild>
              <Button className="sm:hidden" variant="secondary">
                <Menu size={16} />
                {sections.find(([, label]) => label.toLowerCase() === current)?.[1] ?? 'Results'}
              </Button>
            </DialogTrigger>
            <SheetContent>
              <DialogTitle className="text-lg font-semibold">Result sections</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Choose a result view.
              </DialogDescription>
              <DialogClose className="absolute right-3 top-3" aria-label="Close result navigation">
                <X />
              </DialogClose>
              <nav aria-label="Mobile result sections" className="mt-6 grid gap-2">
                {sections.map(([suffix, label]) => (
                  <DialogClose asChild key={label}>
                    <Link
                      href={`/analyses/${analysisId}${suffix}`}
                      aria-current={current === label.toLowerCase() ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground',
                        current === label.toLowerCase() && 'bg-primary text-primary-foreground'
                      )}
                    >
                      {label}
                    </Link>
                  </DialogClose>
                ))}
              </nav>
            </SheetContent>
          </Dialog>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </main>
  );
};
