import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export const baseConfig = [
  { ignores: ['node_modules/**', 'dist/**', '.next/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  prettier,
];

export { prettier as prettierConfig };
