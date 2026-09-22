import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PRODUCER_COMMIT = '50fd5b511326033861b3cab48028b989c4499b3c';
const FE035B_SOURCE_COMMIT = '0f7de13b18a9dd9966074f371cbfd9554490f0ef';
const FE035B_SOURCE_BLOB =
  'c9ed7dfb347144759694056e89d571c433d4dfc8';
const EXPECTED_SHA256 =
  '210cb8f4358fb3b111e0ad3ab7914ef6846ef14af80e781c31544a8fbc527706';
const EXPECTED_FE023 =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1';
const EXPECTED_FE035B =
  'FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1';
const EXPECTED_EXPORTS = {
  './preview-engine': {
    types: './dist/preview-engine.d.ts',
    default: './dist/preview-engine.js',
  },
  './product-neutral-observation-contract-fe035b': {
    types: './dist/product-neutral-observation-contract-fe035b.d.ts',
    default: './dist/product-neutral-observation-contract-fe035b.js',
  },
};
const BASE =
  `https://raw.githubusercontent.com/gycha0109-beep/Saju/${PRODUCER_COMMIT}/distribution/face-reading/fe040b`;
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
  webPackage.dependencies?.['@myeongha/physiognomy-engine-runtime'] === '0.0.0',
  'web must depend only on the isolated MyeongHa physiognomy runtime.',
);
assert(
  !Object.hasOwn(webPackage.dependencies ?? {}, '@myeongha/face-reading'),
  'web must not couple directly to the producer engine package.',
);

const runtimePackage = JSON.parse(
  readFileSync(resolve('packages/face-reading/package.json'), 'utf8'),
);
assert(
  runtimePackage.name === '@myeongha/physiognomy-engine-runtime',
  'isolated runtime package name drift.',
);
assert(
  runtimePackage.dependencies?.['@myeongha/face-reading'] === TARBALL_URL,
  'isolated runtime is not pinned to the immutable FE040B producer tarball.',
);

const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'));
const runtimeWorkspace = lock.packages?.['packages/face-reading'];
assert(
  runtimeWorkspace?.name === '@myeongha/physiognomy-engine-runtime',
  'runtime workspace lock entry drift.',
);
assert(
  runtimeWorkspace?.dependencies?.['@myeongha/face-reading'] === TARBALL_URL,
  'runtime workspace producer pin drift.',
);
assert(
  lock.packages?.['node_modules/@myeongha/physiognomy-engine-runtime']?.link === true &&
    lock.packages?.['node_modules/@myeongha/physiognomy-engine-runtime']?.resolved ===
      'packages/face-reading',
  'runtime workspace link drift.',
);
const installedLock = lock.packages?.['node_modules/@myeongha/face-reading'];
assert(installedLock?.version === '0.0.0', 'lockfile package version drift.');
assert(installedLock?.resolved === TARBALL_URL, 'lockfile tarball URL drift.');
assert(
  lock.packages?.['node_modules/@mediapipe/tasks-vision']?.version === '0.10.35',
  'MediaPipe lock pin drift.',
);

const manifestResponse = await fetchRequired(MANIFEST_URL);
const manifest = await manifestResponse.json();
assert(
  manifest.schemaVersion ===
    'fe040b-canonical-registry-consumer-handoff-manifest-v1',
  'FE040B manifest schema drift.',
);
assert(manifest.package?.name === '@myeongha/face-reading', 'package name drift.');
assert(manifest.package?.version === '0.0.0', 'package version drift.');
assert(
  JSON.stringify(manifest.package?.publicExports) ===
    JSON.stringify([
      './preview-engine',
      './product-neutral-observation-contract-fe035b',
    ]),
  'FE040B public export map drift.',
);
assert(manifest.package?.private === true, 'package private boundary drift.');
assert(manifest.artifact?.sha256 === EXPECTED_SHA256, 'manifest SHA-256 drift.');
assert(manifest.contracts?.fe023 === EXPECTED_FE023, 'FE023 contract drift.');
assert(manifest.contracts?.fe035b === EXPECTED_FE035B, 'FE035B contract drift.');
assert(
  manifest.canonicalRegistry?.sourceRepository === 'gycha0109-beep/Saju' &&
    manifest.canonicalRegistry?.sourceCommit === FE035B_SOURCE_COMMIT &&
    manifest.canonicalRegistry?.sourceBlobSha === FE035B_SOURCE_BLOB &&
    manifest.canonicalRegistry?.regionCount === 4 &&
    manifest.canonicalRegistry?.metricCount === 13 &&
    manifest.canonicalRegistry?.requiredMetricCount === 8 &&
    manifest.canonicalRegistry?.conditionalMetricCount === 5 &&
    manifest.canonicalRegistry?.semanticAuthorityIssued === false,
  'canonical registry provenance or authority boundary drift.',
);
assert(
  manifest.runtimeDependency?.package === '@mediapipe/tasks-vision' &&
    manifest.runtimeDependency?.version === '0.10.35',
  'MediaPipe manifest pin drift.',
);
assert(
  manifest.distribution?.handoffOnly === true &&
    manifest.distribution?.productionInterpretationAuthorityIssued === false,
  'distribution interpretation boundary drift.',
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
  JSON.stringify(installedPackage.exports) === JSON.stringify(EXPECTED_EXPORTS),
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

const registry = await import(
  '@myeongha/face-reading/product-neutral-observation-contract-fe035b'
);
assert(
  registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT_VERSION ===
    EXPECTED_FE035B,
  'public FE035B contract missing.',
);
assert(
  typeof registry.assertProductNeutralObservationContractFE035B === 'function',
  'public FE035B assertion function missing.',
);
registry.assertProductNeutralObservationContractFE035B(
  registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT,
);
assert(
  registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT.regions.length === 4 &&
    registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT.metrics.length === 13,
  'public FE035B canonical registry cardinality drift.',
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
await assertBlocked('@myeongha/face-reading/product-neutral-observation-contract-fe035b.js');

process.stdout.write(
  JSON.stringify({
    status: 'FE033_FACE_PREVIEW_ENGINE_DELIVERY_PASS',
    producerCommit: PRODUCER_COMMIT,
    canonicalSourceCommit: FE035B_SOURCE_COMMIT,
    canonicalSourceBlob: FE035B_SOURCE_BLOB,
    sha256,
    fe023Contract: EXPECTED_FE023,
    fe035bContract: EXPECTED_FE035B,
    publicPreviewImportVerified: true,
    publicCanonicalRegistryImportVerified: true,
    internalImportsBlocked: true,
    productionInterpretationAuthorityIssued: false,
  }) + '\n',
);
