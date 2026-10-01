import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M11-A3 dual-platform export smoke', () => {
  it('keeps Android and iOS Expo exports explicit and isolated', async () => {
    const pkg = JSON.parse(await readRepoFile('apps/mobile/package.json'));

    expect(pkg.scripts['export:ci:android']).toBe(
      'expo export --platform android --output-dir .expo/export-ci/android',
    );
    expect(pkg.scripts['export:ci:ios']).toBe(
      'expo export --platform ios --output-dir .expo/export-ci/ios',
    );
    expect(pkg.scripts['export:ci']).toBe(
      'npm run export:ci:android && npm run export:ci:ios',
    );
  });

  it('runs release preflight before the dual-platform export in Mobile PR CI', async () => {
    const workflow = await readRepoFile('.github/workflows/mobile-pr.yml');
    const preflightIndex = workflow.indexOf(
      'Verify mobile release-readiness contract',
    );
    const exportIndex = workflow.indexOf('Export Android and iOS bundles');

    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(exportIndex).toBeGreaterThan(preflightIndex);
    expect(workflow).toContain(
      'npm run verify:mobile-release-readiness-contract',
    );
    expect(workflow).toContain(
      'npm run export:ci -w @myeongha/mobile',
    );
  });
});
