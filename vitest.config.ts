import { fileURLToPath, URL } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node's built-in test runner owns these research contracts; Vitest cannot register node:test suites.
    exclude: [
      ...configDefaults.exclude,
      'scripts/character-optimization/**/*.test.mjs',
      'scripts/character-runtime-lab/**/*.test.mjs',
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/mobile/src', import.meta.url)),
    },
  },
});
