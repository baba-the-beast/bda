import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Legacy files predating the overhaul (see docs/FRONTEND_AUDIT.md).
 *
 * These are rewritten or deleted in Phase 5. Linting them under
 * strict-type-checked today would produce ~200 findings in code that is about to
 * disappear, so they are excluded and the list shrinks to empty as each domain
 * lands. Do not add to this list: new code is written to the full rule set.
 */
const LEGACY_EXCLUDED = ['src/api.ts', 'src/App.tsx', 'src/pages/**'];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'stitch/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // A dedicated project so e2e specs and config files are type-aware too;
        // tsconfig.json stays scoped to src/ for the production build.
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    settings: {
      'import/resolver': { typescript: true, node: true },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // The whole point of the overhaul: no untyped escape hatches.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // Data honesty: Math.random() has no place in a telemetry console.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'No synthetic data in production code. Every number must come from the API or a labelled user input (docs/FRONTEND_AUDIT.md §3.2).',
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],

      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // Tests may reach for looser typing when building fixtures and may log.
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['*.config.{js,ts}', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: LEGACY_EXCLUDED,
    ...tseslint.configs.disableTypeChecked,
    rules: {
      // Spreading the config object alone is not enough: an own `rules` key
      // replaces the one it carries, which would leave type-aware rules on
      // while type information is switched off.
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-properties': 'off',
      'no-console': 'off',
      'import/order': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'no-empty': 'off',
    },
  },
  prettier,
);
