import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  SheetContent,
  cn,
} from '@ecosuitability/ui';
import { ChevronDown, X } from 'lucide-react';

const steps = [
  ['data', 'Data'],
  ['validation', 'Validation'],
  ['configuration', 'Configuration'],
  ['review', 'Review'],
] as const;

type SetupShellProps = {
  analysisId: string;
  current: (typeof steps)[number][0];
  title: string;
  description: string;
  children: ReactNode;
};

export const SetupShell: React.FC<SetupShellProps> = ({
  analysisId,
  children,
  current,
  description,
  title,
}) => {
  const currentIndex = steps.findIndex(([key]) => key === current);

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
          <p className="font-mono text-xs text-muted-foreground">{analysisId}</p>
          <nav aria-label="Analysis setup" className="mt-4 hidden grid-cols-4 gap-3 sm:grid">
            {steps.map(([key, label], index) => {
              const className = cn(
                'min-h-10 rounded-lg px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:text-sm',
                current === key && 'bg-primary text-primary-foreground',
                index > currentIndex && 'cursor-not-allowed opacity-50'
              );
              const content = (
                <>
                  <span className="hidden sm:inline">{index + 1}. </span>
                  {label}
                </>
              );

              return index <= currentIndex ? (
                <Link
                  key={key}
                  href={`/analyses/${analysisId}/setup/${key}`}
                  aria-current={current === key ? 'step' : undefined}
                  className={className}
                >
                  {content}
                </Link>
              ) : (
                <span key={key} aria-disabled="true" className={className}>
                  {content}
                </span>
              );
            })}
          </nav>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="mt-4 w-full justify-between sm:hidden" variant="secondary">
                <span>{steps.find(([key]) => key === current)?.[1]}</span>
                <ChevronDown size={16} />
              </Button>
            </DialogTrigger>
            <SheetContent>
              <DialogTitle className="text-lg font-semibold">Analysis setup</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                Current step: {steps.find(([key]) => key === current)?.[1]}
              </DialogDescription>
              <DialogClose className="absolute right-3 top-3" aria-label="Close setup navigation">
                <X />
              </DialogClose>
              <nav aria-label="Mobile analysis setup" className="mt-6 grid gap-2">
                {steps.map(([key, label], index) => {
                  const className = cn(
                    'flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground',
                    current === key && 'bg-primary text-primary-foreground',
                    index > currentIndex && 'cursor-not-allowed opacity-50'
                  );

                  return index <= currentIndex ? (
                    <DialogClose asChild key={key}>
                      <Link
                        href={`/analyses/${analysisId}/setup/${key}`}
                        aria-current={current === key ? 'step' : undefined}
                        className={className}
                      >
                        {index + 1}. {label}
                      </Link>
                    </DialogClose>
                  ) : (
                    <span key={key} aria-disabled="true" className={className}>
                      {index + 1}. {label}
                    </span>
                  );
                })}
              </nav>
            </SheetContent>
          </Dialog>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </main>
  );
};
