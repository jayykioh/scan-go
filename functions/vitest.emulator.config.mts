import { defineConfig } from 'vitest/config';

/**
 * Functions Emulator callable tests. These tests call the real Cloud Functions
 * through the Functions emulator and seed Firestore and Auth through the Admin
 * SDK, so run them through `firebase emulators:exec` (see the root
 * `test:emulator` script).
 *
 * Only real emulator test files are included. Files run serially because they
 * share one emulator project and reset its data between cases.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/config/**/*.test.ts',
      'test/auth/**/*.test.ts',
      'test/ai/**/*.test.ts',
      'test/feedback/**/*.test.ts',
      'test/tenant/**/*.test.ts',
      'test/catalog/**/*.test.ts',
      'test/table-access/**/*.test.ts',
      'test/ordering/**/*.test.ts',
      'test/inventory/**/*.test.ts',
      'test/fulfilment/**/*.test.ts',
      'test/onboarding/**/*.test.ts',
      'test/payment/**/*.test.ts',
      'test/admin/**/*.test.ts',
      'test/privacy/**/*.test.ts',
      'test/i18n/**/*.test.ts',
      'test/performance/**/*.test.ts',
      'test/cancellation/**/*.test.ts',
      'test/payment-adapter/**/*.test.ts',
      'test/refund/**/*.test.ts',
      'test/retention/**/*.test.ts',
      'test/backup/**/*.test.ts',
      'test/reporting/**/*.test.ts',
      'test/subscription/**/*.test.ts',
      'test/loyalty/**/*.test.ts',
      'test/promotion/**/*.test.ts',
      'test/workforce/**/*.test.ts',
      'test/nfc/**/*.test.ts',
    ],
    passWithNoTests: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
