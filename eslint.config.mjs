import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  { rules: { curly: ['error', 'all'] } },
  prettier,
];
