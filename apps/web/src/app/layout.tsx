import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { appearanceBootstrapScript } from '@/appearance';
import { getConfiguredBrand } from '@/brand';
import { AppearanceController } from '@/components/AppearanceController';
import './globals.css';

export const metadata: Metadata = {
  title: 'EcoSuitability',
  description: 'Environmental and species suitability analysis.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const brand = getConfiguredBrand();

  return (
    <html
      lang="en"
      data-brand={brand}
      data-theme="light"
      data-appearance="system"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <AppearanceController />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
