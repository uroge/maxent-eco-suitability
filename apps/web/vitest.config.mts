import { fileURLToPath } from 'node:url';
import baseConfig from '../../packages/config/vitest/base.mjs';
import { defineConfig, mergeConfig } from 'vitest/config';

// Browser tests live outside src/ and run only through `pnpm test:e2e`.
export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    },
  })
);
