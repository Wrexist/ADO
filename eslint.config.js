// Flat ESLint config (ESLint 9). Scoped to the gaps strict tsc doesn't already cover —
// unused vars/args, explicit `any` (a project ban), and the JS recommended correctness
// set. `no-undef` is off: TypeScript's checker is the source of truth for undefined refs,
// and these files are all ES modules.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/server/drizzle/**', // generated migrations
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // CommonJS config files (pm2 ecosystem) legitimately use require().
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
