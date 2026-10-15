import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      '@contracts': fileURLToPath(
        new URL('./shared/contracts', import.meta.url),
      ),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    // Node stays the default so the pure-logic suite needs no DOM. A component
    // test opts in with `// @vitest-environment jsdom` at the top of its file.
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'shared/**/*.test.ts',
    ],
    passWithNoTests: true,
  },
});
