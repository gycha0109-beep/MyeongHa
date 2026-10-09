import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const EXPECTED_SCHEMA =
  'fe024-digest-bound-preview-consumer-handoff-manifest-v1';
const EXPECTED_PACKAGE = '@myeongha/face-reading';
const EXPECTED_VERSION = '0.0.0';
const EXPECTED_EXPORT = './preview-engine';
const EXPECTED_FE023 =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1';
const EXPECTED_FE023_CONFIG =
  'fe023-digest-bound-product-preview-config-v1';
const EXPECTED_FE022_ASSET_CONFIG =
  'fe022-digest-bound-mediapipe-model-config-v1';
const EXPECTED_MEDIAPIPE = '0.10.35';
const EXPECTED_ASSET_FIELDS = [
  'wasmRoot',
  'modelAssetPath',
  'modelAssetSha256',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FE025 handoff acceptance failed: ${message}`);
  }
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  }).trim();
}

const handoffDir = resolve(process.argv[2] ?? '');
const expectedSourceCommit = process.argv[3]?.trim() ?? '';
assert(handoffDir !== resolve(''), 'handoff directory argument is required.');
assert(/^[0-9a-f]{40}$/u.test(expectedSourceCommit), 'expected source commit must be a 40-character lowercase SHA.');

const files = readdirSync(handoffDir).sort();
assert(files.length === 2, 'handoff directory must contain exactly two files.');
assert(files.includes('manifest.json'), 'manifest.json is missing.');
const tarballs = files.filter((file) => file.endsWith('.tgz'));
assert(tarballs.length === 1, 'handoff directory must contain exactly one tarball.');

const manifest = JSON.parse(readFileSync(resolve(handoffDir, 'manifest.json'), 'utf8'));
const tarball = tarballs[0];
const tarballPath = resolve(handoffDir, tarball);
const sha256 = createHash('sha256')
  .update(readFileSync(tarballPath))
  .digest('hex');

assert(manifest.schemaVersion === EXPECTED_SCHEMA, 'manifest schema drift.');
assert(manifest.package?.name === EXPECTED_PACKAGE, 'package name drift.');
assert(manifest.package?.version === EXPECTED_VERSION, 'package version drift.');
assert(manifest.package?.publicExportPath === EXPECTED_EXPORT, 'public export path drift.');
assert(manifest.package?.private === true, 'package must remain private.');
assert(manifest.artifact?.filename === basename(tarball), 'manifest filename mismatch.');
assert(manifest.artifact?.sha256 === sha256, 'tarball SHA-256 mismatch.');
assert(manifest.contract?.fe023 === EXPECTED_FE023, 'FE023 contract drift.');
assert(
  manifest.contract?.openFunction === 'openDigestBoundProductPreviewSessionFE023',
  'FE023 open function drift.',
);
assert(manifest.source?.commit === expectedSourceCommit, 'source commit mismatch.');
assert(
  manifest.runtimeConfiguration?.schemaVersion === EXPECTED_FE023_CONFIG &&
    manifest.runtimeConfiguration?.assetSchemaVersion === EXPECTED_FE022_ASSET_CONFIG,
  'runtime config schema drift.',
);
assert(
  JSON.stringify(manifest.runtimeConfiguration?.requiredAssetFields) ===
    JSON.stringify(EXPECTED_ASSET_FIELDS),
  'runtime asset field obligations drift.',
);
assert(
  manifest.runtimeConfiguration?.modelDigestAlgorithm === 'SHA-256' &&
    manifest.runtimeConfiguration?.modelDigestRequired === true &&
    manifest.runtimeConfiguration?.wasmDigestVerifiedByEngine === false &&
    manifest.runtimeConfiguration?.assetValuesBundled === false,
  'runtime asset integrity boundary drift.',
);
assert(
  manifest.runtimeDependency?.package === '@mediapipe/tasks-vision' &&
    manifest.runtimeDependency?.version === EXPECTED_MEDIAPIPE,
  'MediaPipe dependency pin drift.',
);
assert(
  manifest.distribution?.registryPublished === false &&
    manifest.distribution?.handoffOnly === true,
  'distribution boundary drift.',
);

const tempRoot = mkdtempSync(join(tmpdir(), 'myeongha-fe025-'));
try {
  writeFileSync(
    join(tempRoot, 'package.json'),
    JSON.stringify({
      name: 'myeongha-fe025-handoff-acceptance',
      version: '0.0.0',
      private: true,
      type: 'module',
    }, null, 2) + '\n',
    'utf8',
  );

  run('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    tarballPath,
  ], tempRoot);

  const consumerCheck = `
    const preview = await import('@myeongha/face-reading/preview-engine');
    if (preview.FE023_CONTRACT_VERSION !== ${JSON.stringify(EXPECTED_FE023)}) {
      throw new Error('FE023 contract missing from accepted handoff.');
    }
    if (typeof preview.openDigestBoundProductPreviewSessionFE023 !== 'function') {
      throw new Error('FE023 open function missing from accepted handoff.');
    }
    async function blocked(specifier) {
      try {
        await import(specifier);
      } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return;
        throw error;
      }
      throw new Error('Expected blocked path: ' + specifier);
    }
    await blocked('@myeongha/face-reading');
    await blocked('@myeongha/face-reading/digest-bound-product-preview-session-fe023');
    await blocked('@myeongha/face-reading/digest-bound-mediapipe-model-runtime-fe022');
  `;
  run('node', ['--input-type=module', '-e', consumerCheck], tempRoot);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  status: 'FE025_FACE_PREVIEW_HANDOFF_ACCEPTED',
  sourceCommit: expectedSourceCommit,
  artifact: tarball,
  sha256,
  fe023ImportVerified: true,
  internalPathsBlocked: true,
  registryPublished: false,
})}\n`);
