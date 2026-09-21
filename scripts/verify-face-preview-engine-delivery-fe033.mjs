import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PRODUCER_COMMIT = '1f80c30f5c829ce8d0d839cdd5816dad943c5afd';
const FE024_SOURCE_COMMIT = '1c0be383844bd7c5aa75079e2084da7bee9de13c';
const EXPECTED_SHA256 =
  '8d793c57e104fc0137a17dc631d208b468131b1d9a9668142a846e34dacbf84a';
const EXPECTED_SHA512 =
  'sha512-6ZlKpf15SkxTMVPoRes1MLcwJKVyC6+YORLtMXSFJXGmGL/8zvcrxV7QAxyrkmN1JOZOURPFdWJrsx76PTrbhQ==';
const EXPECTED_FE023 =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1';
const BASE =
  `https://raw.githubusercontent.com/gycha0109-beep/Saju/${PRODUCER_COMMIT}/distribution/face-reading/fe024`;
const TARBALL_URL = `${BASE}/myeongha-face-reading-0.0.0.tgz`;
const MANIFEST_URL = `${BASE}/manifest.json`;

function assert(condition, message) {
  if (!condition) throw new Error(`FE033 delivery verification failed: ${message}`);
}

async function fetchRequired(url) {
  const response = await fetch(url, { redirect: 'follow' });
  assert(response.ok, `fetch failed for ${url}: ${response.status}`);
  return response;
}

const webPackage = JSON.parse(
  readFileSync(resolve('apps/web/package.json'), 'utf8'),
);
assert(
  webPackage.dependencies?.['@myeongha/face-reading'] === TARBALL_URL,
  'web dependency is not pinned to the immutable producer tarball.',
);

const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'));
const installedLock = lock.packages?.['node_modules/@myeongha/face-reading'];
assert(installedLock?.version === '0.0.0', 'lockfile package version drift.');
assert(installedLock?.resolved === TARBALL_URL, 'lockfile tarball URL drift.');
assert(installedLock?.integrity === EXPECTED_SHA512, 'lockfile tarball integrity drift.');
assert(
  lock.packages?.['node_modules/@mediapipe/tasks-vision']?.version === '0.10.35',
  'MediaPipe lock pin drift.',
);

const manifestResponse = await fetchRequired(MANIFEST_URL);
const manifest = await manifestResponse.json();
assert(
  manifest.schemaVersion ===
    'fe024-digest-bound-preview-consumer-handoff-manifest-v1',
  'manifest schema drift.',
);
assert(manifest.package?.name === '@myeongha/face-reading', 'package name drift.');
assert(manifest.package?.version === '0.0.0', 'package version drift.');
assert(manifest.package?.publicExportPath === './preview-engine', 'public export drift.');
assert(manifest.package?.private === true, 'package private boundary drift.');
assert(manifest.artifact?.sha256 === EXPECTED_SHA256, 'manifest SHA-256 drift.');
assert(manifest.contract?.fe023 === EXPECTED_FE023, 'FE023 contract drift.');
assert(
  manifest.contract?.openFunction === 'openDigestBoundProductPreviewSessionFE023',
  'FE023 open function drift.',
);
assert(
  manifest.runtimeDependency?.package === '@mediapipe/tasks-vision' &&
    manifest.runtimeDependency?.version === '0.10.35',
  'MediaPipe manifest pin drift.',
);
assert(manifest.source?.commit === FE024_SOURCE_COMMIT, 'FE024 source provenance drift.');
assert(
  manifest.distribution?.registryPublished === false &&
    manifest.distribution?.handoffOnly === true,
  'distribution boundary drift.',
);

const tarballResponse = await fetchRequired(TARBALL_URL);
const tarballBytes = Buffer.from(await tarballResponse.arrayBuffer());
const sha256 = createHash('sha256').update(tarballBytes).digest('hex');
assert(sha256 === EXPECTED_SHA256, 'producer tarball SHA-256 mismatch.');

const installedPackage = JSON.parse(
  readFileSync(resolve('node_modules/@myeongha/face-reading/package.json'), 'utf8'),
);
assert(installedPackage.name === '@myeongha/face-reading', 'installed package name drift.');
assert(installedPackage.version === '0.0.0', 'installed package version drift.');
assert(installedPackage.private === true, 'installed package private boundary drift.');
assert(
  JSON.stringify(installedPackage.exports) ===
    JSON.stringify({
      './preview-engine': {
        types: './dist/preview-engine.d.ts',
        default: './dist/preview-engine.js',
      },
    }),
  'installed package export map widened or drifted.',
);
assert(
  installedPackage.dependencies?.['@mediapipe/tasks-vision'] === '0.10.35',
  'installed package MediaPipe pin drift.',
);

const preview = await import('@myeongha/face-reading/preview-engine');
assert(preview.FE023_CONTRACT_VERSION === EXPECTED_FE023, 'public FE023 contract missing.');
assert(
  typeof preview.openDigestBoundProductPreviewSessionFE023 === 'function',
  'public FE023 open function missing.',
);

async function assertBlocked(specifier) {
  try {
    await import(specifier);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ) {
      return;
    }
    throw error;
  }
  throw new Error(`FE033 delivery verification failed: expected blocked import ${specifier}`);
}

await assertBlocked('@myeongha/face-reading');
await assertBlocked('@myeongha/face-reading/digest-bound-product-preview-session-fe023');
await assertBlocked('@myeongha/face-reading/digest-bound-mediapipe-model-runtime-fe022');

process.stdout.write(
  JSON.stringify({
    status: 'FE033_FACE_PREVIEW_ENGINE_DELIVERY_PASS',
    producerCommit: PRODUCER_COMMIT,
    sourceCommit: FE024_SOURCE_COMMIT,
    sha256,
    fe023Contract: EXPECTED_FE023,
    publicImportVerified: true,
    internalImportsBlocked: true,
    registryPublished: false,
  }) + '\n',
);
