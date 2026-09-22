import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PRODUCER_COMMIT = '37f3728996992144eaa60b083334e466ae648b98';
const VALIDATED_FE041D_HEAD = '66a98e15d27d2aa7dfb6d09df27bee57c137b1c5';
const FE035B_SOURCE_COMMIT = '0f7de13b18a9dd9966074f371cbfd9554490f0ef';
const FE035B_SOURCE_BLOB = 'c9ed7dfb347144759694056e89d571c433d4dfc8';
const EXPECTED_SHA256 = 'f306515639aef5366308018ec3374f35ee1c20c35adb107ee140381ee6c8cd6d';
const EXPECTED_FE023 =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1';
const EXPECTED_FE035B =
  'FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1';
const EXPECTED_FE041B =
  'FE041B-SQUARE-BROAD-OPERATIONALIZATION-READINESS-v1';
const EXPECTED_FE041D =
  'FE041D-SQUARE-BROAD-CANDIDATE-METRIC-MAPPING-READINESS-v1';
const EXPECTED_EXPORTS = {
  './preview-engine': {
    types: './dist/preview-engine.d.ts',
    default: './dist/preview-engine.js',
  },
  './product-neutral-observation-contract-fe035b': {
    types: './dist/product-neutral-observation-contract-fe035b.d.ts',
    default: './dist/product-neutral-observation-contract-fe035b.js',
  },
  './square-broad-operationalization-readiness-fe041b': {
    types: './dist/square-broad-operationalization-readiness-fe041b.d.ts',
    default: './dist/square-broad-operationalization-readiness-fe041b.js',
  },
  './square-broad-candidate-metric-mapping-readiness-fe041d': {
    types: './dist/square-broad-candidate-metric-mapping-readiness-fe041d.d.ts',
    default: './dist/square-broad-candidate-metric-mapping-readiness-fe041d.js',
  },
};
const BASE =
  `https://raw.githubusercontent.com/gycha0109-beep/Saju/${PRODUCER_COMMIT}/distribution/face-reading/fe041d`;
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

const webPackage = JSON.parse(readFileSync(resolve('apps/web/package.json'), 'utf8'));
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
assert(runtimePackage.name === '@myeongha/physiognomy-engine-runtime', 'runtime package name drift.');
assert(
  runtimePackage.dependencies?.['@myeongha/face-reading'] === TARBALL_URL,
  'runtime is not pinned to the immutable FE041D producer tarball.',
);

const lock = JSON.parse(readFileSync(resolve('package-lock.json'), 'utf8'));
assert(
  lock.packages?.['packages/face-reading']?.dependencies?.['@myeongha/face-reading'] ===
    TARBALL_URL,
  'runtime workspace producer pin drift.',
);
const installedLock = lock.packages?.['node_modules/@myeongha/face-reading'];
assert(installedLock?.version === '0.0.0', 'lockfile package version drift.');
assert(installedLock?.resolved === TARBALL_URL, 'lockfile tarball URL drift.');
assert(
  lock.packages?.['node_modules/@mediapipe/tasks-vision']?.version === '0.10.35',
  'MediaPipe lock pin drift.',
);

const manifest = await (await fetchRequired(MANIFEST_URL)).json();
assert(
  manifest.schemaVersion ===
    'fe041d-square-broad-candidate-metric-mapping-readiness-handoff-manifest-v1',
  'FE041D manifest schema drift.',
);
assert(manifest.package?.name === '@myeongha/face-reading', 'package name drift.');
assert(manifest.package?.version === '0.0.0', 'package version drift.');
assert(
  JSON.stringify(manifest.package?.publicExports) === JSON.stringify(Object.keys(EXPECTED_EXPORTS)),
  'FE041D public export map drift.',
);
assert(manifest.package?.private === true, 'package private boundary drift.');
assert(manifest.artifact?.sha256 === EXPECTED_SHA256, 'manifest SHA-256 drift.');
assert(manifest.contracts?.fe041d === EXPECTED_FE041D, 'FE041D contract drift.');
assert(
  manifest.researchSnapshot?.commit ===
    '8b49d4e03e35ef5447f0f2873ff2b8737bd36110' &&
    manifest.researchSnapshot?.fe035bSourceBlob === FE035B_SOURCE_BLOB &&
    manifest.researchSnapshot?.fr141SourceBlob ===
      'a2a621bb2088f9002480caf6a89bbc0a40e50538' &&
    manifest.researchSnapshot?.fr142SourceBlob ===
      '004a2cdb21bc6f247e48cae52429afaf54f6804d' &&
    manifest.researchSnapshot?.fr143SourceBlob ===
      '293e29e65239894a5ec21befbd7152c339250759',
  'FE041D research snapshot drift.',
);
assert(
  manifest.mappingReadiness?.candidateMetricCount === 3 &&
    manifest.mappingReadiness?.canonicalRegistryMetricCount === 13 &&
    manifest.mappingReadiness?.canonicalRegistryIntersectionCount === 0 &&
    manifest.mappingReadiness?.canonicalMetricBindingAuthorized === false &&
    manifest.mappingReadiness?.traditionalFangBindingAuthorized === false &&
    manifest.mappingReadiness?.constructValidityEstablished === false &&
    manifest.mappingReadiness?.empiricalSemanticEvidenceAdmitted === false &&
    manifest.mappingReadiness?.calibrationAuthorityIssued === false &&
    manifest.mappingReadiness?.numericThresholdAuthorityIssued === false &&
    manifest.mappingReadiness?.criterionStateIssued === false &&
    manifest.mappingReadiness?.productionSemanticExecutionAuthorized === false,
  'FE041D mapping boundary drift.',
);
assert(
  manifest.distribution?.handoffOnly === true &&
    manifest.distribution?.productionInterpretationAuthorityIssued === false,
  'distribution interpretation boundary drift.',
);

const tarballBytes = Buffer.from(
  await (await fetchRequired(TARBALL_URL)).arrayBuffer(),
);
const sha256 = createHash('sha256').update(tarballBytes).digest('hex');
assert(sha256 === EXPECTED_SHA256, 'producer tarball SHA-256 mismatch.');

const installedPackage = JSON.parse(
  readFileSync(resolve('node_modules/@myeongha/face-reading/package.json'), 'utf8'),
);
assert(
  JSON.stringify(installedPackage.exports) === JSON.stringify(EXPECTED_EXPORTS),
  'installed package export map widened or drifted.',
);

const preview = await import('@myeongha/face-reading/preview-engine');
assert(preview.FE023_CONTRACT_VERSION === EXPECTED_FE023, 'FE023 contract missing.');

const registry = await import(
  '@myeongha/face-reading/product-neutral-observation-contract-fe035b'
);
assert(
  registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT_VERSION === EXPECTED_FE035B,
  'FE035B contract missing.',
);
registry.assertProductNeutralObservationContractFE035B(
  registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT,
);
assert(
  registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT.regions.length === 4 &&
    registry.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT.metrics.length === 13,
  'FE035B canonical registry cardinality drift.',
);

const readiness = await import(
  '@myeongha/face-reading/square-broad-operationalization-readiness-fe041b'
);
assert(
  readiness.FE041B_SQUARE_BROAD_OPERATIONALIZATION_READINESS_VERSION === EXPECTED_FE041B,
  'FE041B readiness contract missing.',
);
const readinessArtifact = readiness.issueSquareBroadOperationalizationReadinessFE041B();
readiness.assertIssuedSquareBroadOperationalizationReadinessFE041B(readinessArtifact);
assert(
  readinessArtifact.operationalization?.canonicalInputMetricRefs?.length === 0 &&
    readinessArtifact.authorityBoundary?.productionSemanticExecutionAuthorized === false,
  'FE041B readiness boundary widened.',
);

const mapping = await import(
  '@myeongha/face-reading/square-broad-candidate-metric-mapping-readiness-fe041d'
);
assert(
  mapping.FE041D_SQUARE_BROAD_CANDIDATE_METRIC_MAPPING_READINESS_VERSION === EXPECTED_FE041D,
  'FE041D mapping contract missing.',
);
const mappingArtifact =
  mapping.issueSquareBroadCandidateMetricMappingReadinessFE041D();
mapping.assertIssuedSquareBroadCandidateMetricMappingReadinessFE041D(mappingArtifact);
assert(
  mappingArtifact.candidateMetricRefs?.length === 3 &&
    mappingArtifact.canonicalRegistryMetricCount === 13 &&
    mappingArtifact.canonicalRegistryIntersection?.length === 0 &&
    mappingArtifact.mappingDecision?.canonicalMetricBindingAuthorized === false &&
    mappingArtifact.mappingDecision?.traditionalFangBindingAuthorized === false &&
    mappingArtifact.authorityBoundary?.productionSemanticExecutionAuthorized === false,
  'FE041D mapping authority widened.',
);

async function assertBlocked(specifier) {
  try { await import(specifier); }
  catch (error) {
    if (error && typeof error === 'object' &&
        error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') return;
    throw error;
  }
  throw new Error(`FE033 delivery verification failed: expected blocked import ${specifier}`);
}
await assertBlocked('@myeongha/face-reading');
await assertBlocked('@myeongha/face-reading/five-officers-square-broad-fang-neutral-candidate-metric-runtime-fr142');
await assertBlocked('@myeongha/face-reading/square-broad-candidate-metric-mapping-readiness-fe041d.js');

process.stdout.write(JSON.stringify({
  status: 'FE033_FACE_PREVIEW_ENGINE_DELIVERY_PASS',
  producerCommit: PRODUCER_COMMIT,
  validatedFe041dHead: VALIDATED_FE041D_HEAD,
  canonicalSourceCommit: FE035B_SOURCE_COMMIT,
  canonicalSourceBlob: FE035B_SOURCE_BLOB,
  sha256,
  fe023Contract: EXPECTED_FE023,
  fe035bContract: EXPECTED_FE035B,
  fe041bContract: EXPECTED_FE041B,
  fe041dContract: EXPECTED_FE041D,
  exactCanonicalIntersectionZeroVerified: true,
  productionInterpretationAuthorityIssued: false,
}) + '\n');
