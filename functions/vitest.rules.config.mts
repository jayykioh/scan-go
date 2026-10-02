import { defineConfig } from 'vitest/config';

/**
 * Security Rules test project. These tests talk to the Firestore emulator, so
 * run them through `firebase emulators:exec` (see the root `test:rules` script).
 *
 * Only real rules test files are included. The remaining names in
 * `test/rules/` are placeholders; add them here as each ticket makes them real.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/rules/config.rules.test.ts',
      'test/rules/auth.rules.test.ts',
      'test/rules/admin.rules.test.ts',
      'test/rules/catalog.rules.test.ts',
      'test/rules/table.rules.test.ts',
      'test/rules/ordering.rules.test.ts',
      'test/rules/inventory.rules.test.ts',
      'test/rules/payment.rules.test.ts',
      'test/rules/reporting.rules.test.ts',
      'test/rules/ai-usage.rules.test.ts',
      'test/rules/feedback.rules.test.ts',
      'test/rules/feedback-tickets.rules.test.ts',
      'test/rules/workforce.rules.test.ts',
      'test/rules/stock-count.rules.test.ts',
      'test/rules/campaign.rules.test.ts',
      'test/rules/storage.rules.test.ts',
      'test/rules/loyalty.rules.test.ts',
    ],
    passWithNoTests: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
