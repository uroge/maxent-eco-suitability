import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@ecosuitability/ui';

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
}) => (
  <main className="min-h-[calc(100vh-var(--header-height))] bg-background">
    <div className="border-b border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
        <p className="font-mono text-xs text-muted-foreground">{analysisId}</p>
        <nav aria-label="Analysis setup" className="mt-4 grid grid-cols-4 gap-1 sm:gap-3">
          {steps.map(([key, label], index) => (
            <Link
              key={key}
              href={`/analyses/${analysisId}/setup/${key}`}
              aria-current={current === key ? 'step' : undefined}
              className={cn(
                'min-h-10 rounded-lg px-2 py-2 text-center text-xs font-medium text-muted-foreground sm:text-sm',
                current === key && 'bg-primary text-primary-foreground'
              )}
            >
              <span className="hidden sm:inline">{index + 1}. </span>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-8">{children}</div>
    </div>
  </main>
);
