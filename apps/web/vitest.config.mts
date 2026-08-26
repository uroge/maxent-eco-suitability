import baseConfig from '@ecosuitability/config/vitest/base';
import { defineConfig, mergeConfig } from 'vitest/config';

// Browser tests live outside src/ and run only through `pnpm test:e2e`.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    },
  })
);
