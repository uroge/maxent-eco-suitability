import type { ReactNode } from 'react';
import { AppHeader } from './AppHeader';

export const ContentPage: React.FC<{
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}> = ({ children, eyebrow, intro, title }) => (
  <main className="min-h-screen bg-background">
    <AppHeader />
    <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">{intro}</p>
      <div className="mt-10 space-y-9 text-sm leading-7 text-foreground">{children}</div>
    </article>
  </main>
);
