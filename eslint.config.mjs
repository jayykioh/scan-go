import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/lib/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.firebase/**',
      '**/.pw-cache/**',
      '**/.playwright-cli/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': 'off',
      'no-useless-assignment': 'off',
    },
  },
  {
    files: ['**/*.config.{js,mjs,ts}', 'eslint.config.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Feedback harness scripts are Node ESM run with `node`, not part of the
    // Vite bundle: they need Node globals plus browser globals for the code
    // inside `page.evaluate(...)`, and their deliberate `.catch(() => {})`
    // guards are empty on purpose.
    files: ['docs/feedback/harness/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-empty': 'off',
    },
  },
);
