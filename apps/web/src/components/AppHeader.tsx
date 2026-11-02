import Link from 'next/link';
import { BookOpen, CircleHelp, RefreshCw } from 'lucide-react';
import { Button } from '@ecosuitability/ui';

const BrandMark = () => {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
    >
      <svg fill="none" height="18" viewBox="0 0 18 18" width="18">
        <path d="M9 2.5 13.5 7.5H11V13H7V7.5H4.5L9 2.5Z" fill="currentColor" />
        <path d="M3.5 15h11" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    </span>
  );
};

export const AppHeader = () => {
  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex min-h-header items-center justify-between gap-4 px-5 sm:px-8">
        <Link aria-label="EcoSuitability home" className="flex min-w-0 items-center gap-3" href="/">
          <BrandMark />
          <span className="min-w-0 max-[420px]:hidden">
            <span className="block truncate text-sm font-semibold leading-none text-foreground">
              EcoSuitability
            </span>
            <span className="mt-1 hidden truncate text-xs leading-none text-muted-foreground sm:block">
              Species &amp; Environmental Suitability Analysis
            </span>
          </span>
        </Link>
        <nav aria-label="Utility navigation" className="flex items-center gap-1">
          <Link
            className="hidden min-h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex"
            href="/methodology"
          >
            <BookOpen aria-hidden="true" size={15} />
            Methodology
          </Link>
          <Link
            className="hidden min-h-10 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:text-foreground md:inline-flex"
            href="/help"
          >
            <CircleHelp aria-hidden="true" size={15} />
            Help
          </Link>
          <Button asChild className="ml-1" size="sm">
            <Link href="/analyses/new">
              <RefreshCw aria-hidden="true" size={15} />
              <span className="hidden sm:inline">New analysis</span>
              <span className="sm:hidden">New</span>
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
};
