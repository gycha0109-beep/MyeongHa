import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectMobileExportPlatformV1,
  verifyMobileExportArtifactsV1,
} from '../scripts/verify-mobile-export-artifacts.mjs';

const roots: string[] = [];

async function makeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'myeongha-mobile-export-'));
  roots.push(root);
  return root;
}

async function writePlatform(
  root: string,
  platform: 'android' | 'ios',
  options: {
    metadata?: string;
    bundle?: string;
    oppositeBundle?: boolean;
  } = {},
) {
  const platformRoot = path.join(root, platform);
  const bundleDir = path.join(
    platformRoot,
    '_expo',
    'static',
    'js',
    platform,
  );
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    path.join(platformRoot, 'metadata.json'),
    options.metadata ?? '{"version":1}',
  );
  await writeFile(
    path.join(bundleDir, 'entry-test.hbc'),
    options.bundle ?? 'hermes-bytecode',
  );

  if (options.oppositeBundle) {
    const opposite = platform === 'android' ? 'ios' : 'android';
    const oppositeDir = path.join(
      platformRoot,
      '_expo',
      'static',
      'js',
      opposite,
    );
    await mkdir(oppositeDir, { recursive: true });
    await writeFile(path.join(oppositeDir, 'entry-wrong.hbc'), 'wrong');
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

describe('mobile export artifact verifier', () => {
  it('accepts isolated non-empty Android and iOS Hermes exports', async () => {
    const root = await makeRoot();
    await writePlatform(root, 'android');
    await writePlatform(root, 'ios');

    const reports = await verifyMobileExportArtifactsV1(root);

    expect(reports.map((report) => report.platform)).toEqual([
      'android',
      'ios',
    ]);
    expect(reports.every((report) => report.bundleCount === 1)).toBe(true);
    expect(reports.every((report) => report.bundleBytes > 0)).toBe(true);
  });

  it('rejects invalid metadata JSON', async () => {
    const root = await makeRoot();
    await writePlatform(root, 'android', { metadata: '{' });

    await expect(
      inspectMobileExportPlatformV1(root, 'android'),
    ).rejects.toThrow('metadata.json must contain valid JSON');
  });

  it('rejects empty Hermes bundles', async () => {
    const root = await makeRoot();
    await writePlatform(root, 'ios', { bundle: '' });

    await expect(
      inspectMobileExportPlatformV1(root, 'ios'),
    ).rejects.toThrow('empty Hermes bundle');
  });

  it('rejects opposite-platform Hermes bundle contamination', async () => {
    const root = await makeRoot();
    await writePlatform(root, 'android', { oppositeBundle: true });

    await expect(
      inspectMobileExportPlatformV1(root, 'android'),
    ).rejects.toThrow('unexpectedly contains ios Hermes bundles');
  });
});
