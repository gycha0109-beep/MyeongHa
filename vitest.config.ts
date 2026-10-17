import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The four Node built-in test suites are explicitly executed with
    // node --test in both npm test and run-track-tests.mjs, not Vitest.
    // Vitest cannot discover node:test declarations as its own suite.
    exclude: [
      ...configDefaults.exclude,
      'scripts/commerce/m1-18-migration-parity-gate.test.mjs',
      'scripts/operations/m1-19-live-migration-impact.test.mjs',
      'scripts/operations/m1-20-safe-staging-preflight.test.mjs',
      'scripts/operations/m1-22-nonproduction-evidence-gate.test.mjs',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/mobile/src', import.meta.url)),
    },
  },
});
