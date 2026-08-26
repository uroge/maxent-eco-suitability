import globals from 'globals';
import { baseConfig } from '@ecosuitability/config/eslint/base';

export default [
  ...baseConfig,
  {
    ignores: ['eslint.config.mjs'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
    },
  },
];
