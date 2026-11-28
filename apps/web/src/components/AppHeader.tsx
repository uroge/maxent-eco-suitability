import Link from 'next/link';
import { BookOpen, CircleHelp, RefreshCw } from 'lucide-react';
import { BrandLockup, Button } from '@ecosuitability/ui';

export const AppHeader = () => {
  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className="flex min-h-header items-center justify-between gap-4 px-5 sm:px-8">
        <Link aria-label="EcoSuitability home" className="flex min-w-0 items-center gap-3" href="/">
          <BrandLockup
            className="[&>span:last-child]:max-[420px]:hidden"
            descriptor="Species & Environmental Suitability Analysis"
          />
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
