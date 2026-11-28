import baseConfig from '@ecosuitability/config/vitest/base';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    },
  })
);
