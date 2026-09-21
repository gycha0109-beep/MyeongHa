import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const vendorRoot = resolve('vendor/face-preview');
const manifestPath = resolve(vendorRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FE032 vendored engine verification failed: ${message}`);
  }
}

assert(
  manifest.schemaVersion ===
    'fe024-digest-bound-preview-consumer-handoff-manifest-v1',
  'handoff manifest schema drift.',
);
assert(
  manifest.source?.commit ===
    '1c0be383844bd7c5aa75079e2084da7bee9de13c',
  'Saju source commit drift.',
);
assert(
  manifest.contract?.fe023 ===
    'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1' &&
    manifest.contract?.openFunction ===
      'openDigestBoundProductPreviewSessionFE023',
  'FE023 contract drift.',
);
assert(
  manifest.runtimeDependency?.package === '@mediapipe/tasks-vision' &&
    manifest.runtimeDependency?.version === '0.10.35',
  'MediaPipe dependency drift.',
);
assert(
  manifest.distribution?.registryPublished === false &&
    manifest.distribution?.handoffOnly === true,
  'distribution boundary drift.',
);

const tarballPath = resolve(vendorRoot, manifest.artifact?.filename ?? '');
assert(
  basename(tarballPath) === 'myeongha-face-reading-0.0.0.tgz',
  'tarball filename drift.',
);
const tarball = readFileSync(tarballPath);
const sha256 = createHash('sha256').update(tarball).digest('hex');
assert(
  sha256 === '8d793c57e104fc0137a17dc631d208b468131b1d9a9668142a846e34dacbf84a' &&
    sha256 === manifest.artifact.sha256,
  'tarball SHA-256 mismatch.',
);

const packageJson = JSON.parse(
  execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
    encoding: 'utf8',
  }),
);
assert(
  packageJson.name === '@myeongha/face-reading' &&
    packageJson.version === '0.0.0' &&
    packageJson.private === true,
  'package identity drift.',
);
assert(
  JSON.stringify(Object.keys(packageJson.exports ?? {})) ===
    JSON.stringify(['./preview-engine']),
  'package export surface drift.',
);
assert(
  packageJson.dependencies?.['@mediapipe/tasks-vision'] === '0.10.35',
  'package MediaPipe pin drift.',
);

const tempRoot = mkdtempSync(join(tmpdir(), 'myeongha-fe032-'));
try {
  writeFileSync(
    join(tempRoot, 'package.json'),
    JSON.stringify({
      name: 'myeongha-fe032-verifier',
      version: '0.0.0',
      private: true,
      type: 'module',
    }, null, 2) + '\n',
    'utf8',
  );
  execFileSync('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    tarballPath,
  ], {
    cwd: tempRoot,
    stdio: 'pipe',
  });

  const check = `
    const preview = await import('@myeongha/face-reading/preview-engine');
    if (
      preview.FE023_CONTRACT_VERSION !==
        'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1' ||
      typeof preview.openDigestBoundProductPreviewSessionFE023 !== 'function'
    ) {
      throw new Error('FE023 public contract unavailable.');
    }
    async function blocked(specifier) {
      try {
        await import(specifier);
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
        ) return;
        throw error;
      }
      throw new Error('Unexpected exported path: ' + specifier);
    }
    await blocked('@myeongha/face-reading');
    await blocked(
      '@myeongha/face-reading/digest-bound-product-preview-session-fe023'
    );
  `;
  execFileSync('node', ['--input-type=module', '-e', check], {
    cwd: tempRoot,
    stdio: 'pipe',
  });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  status: 'FE032_VENDORED_FACE_PREVIEW_ENGINE_PASS',
  sourceCommit: manifest.source.commit,
  artifact: manifest.artifact.filename,
  sha256,
  publicExportPath: './preview-engine',
  registryPublished: false,
})}\n`);
