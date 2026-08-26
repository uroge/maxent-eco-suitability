import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { appearanceBootstrapScript } from '@/appearance';
import { getConfiguredBrand } from '@/brand';
import { AppearanceController } from '@/components/appearance-controller';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

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
      className={`${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppearanceController />
        {children}
      </body>
    </html>
  );
}
