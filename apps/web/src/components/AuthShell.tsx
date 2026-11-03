import Link from 'next/link';
import type React from 'react';
import { BrandLockup, BrandMark } from '@ecosuitability/ui';

type AuthShellProps = {
  children: React.ReactNode;
};

export const AuthShell: React.FC<AuthShellProps> = ({ children }) => {
  return (
    <main className="grid min-h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section className="relative hidden overflow-hidden bg-hero px-12 py-10 text-hero-foreground lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-28 text-inverse-foreground opacity-[0.08]"
        >
          <BrandMark className="size-[38rem]" />
        </div>
        <Link
          aria-label="EcoSuitability home"
          className="relative z-10 w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inverse-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-hero"
          href="/"
        >
          <BrandLockup descriptor="Species & environmental suitability analysis" tone="inverse" />
        </Link>
        <div className="relative z-10 max-w-xl pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-inverse-muted">
            Reproducible spatial modelling
          </p>
          <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.035em] xl:text-5xl">
            Scientific modelling, made spatial.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-inverse-muted">
            Validate occurrence data, model habitat suitability with R maxnet, and explore every
            result with transparent inputs and reproducibility metadata.
          </p>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-inverse-muted">
            <li>MaxEnt methodology</li>
            <li>GIS-ready outputs</li>
            <li>48-hour private results</li>
          </ul>
        </div>
      </section>

      <section className="flex min-w-0 flex-col px-5 py-6 sm:px-8 sm:py-8 lg:items-center lg:justify-center lg:px-12">
        <Link
          aria-label="EcoSuitability home"
          className="mb-10 w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 lg:hidden"
          href="/"
        >
          <BrandLockup descriptor="Suitability analysis" />
        </Link>
        <div className="mx-auto flex w-full max-w-[28rem] justify-center">{children}</div>
        <p className="mx-auto mt-8 max-w-[28rem] text-center text-xs leading-5 text-muted-foreground">
          Analysis data is temporary and automatically removed after the published retention window.
        </p>
      </section>
    </main>
  );
};
