import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REPOSITORY = 'google-ai-edge/mediapipe';
const TAG_COMMIT = 'f8ef212d5c962c0e853db7e59d217056b187084b';
const RELEASE_API_URL = 'https://api.github.com/repos/google-ai-edge/mediapipe/releases/314747935';
const OUTPUT_PATH = 'artifacts/face-reading/fr31-source-build-recipe-attestation.json';

const EXPECTED_FILES = Object.freeze({
  '.bazelversion': '815da58b7a9ed1179ad6dd58c1ecac25e86fd77e',
  'mediapipe/tasks/web/vision/BUILD': '0dee1e6153366f79cc9f787900f7b0bcf3c7462a',
  'mediapipe/tasks/web/rollup.config.mjs': '6d93653dcdadfe67e6d8a33530982a27c20cbb07',
  'mediapipe/tasks/web/package.json': '6f250cfdfc993effb2b4e3c353dc7ccaf205e2b7',
  'package.json': '2b799c335a93f3c0a987eaf0e1a0abf8c8c54c51',
  'yarn.lock': 'c0268f53100bef8c45c3dd26874732b724b8f768',
});

function sha1(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.byteLength}\0`, 'utf8');
  return sha1(Buffer.concat([header, buffer]));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) throw new Error(`${label} missing expected source fragment: ${expected}`);
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MyeongHa-FR31-Attestation' } });
  if (!response.ok) throw new Error(`FR-31 fetch failed: ${response.status} ${response.statusText} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const files = {};
  for (const [path, expectedBlobSha] of Object.entries(EXPECTED_FILES)) {
    const url = `https://raw.githubusercontent.com/${REPOSITORY}/${TAG_COMMIT}/${path}`;
    const bytes = await fetchBytes(url);
    const computedBlobSha = gitBlobSha(bytes);
    assertEqual(computedBlobSha, expectedBlobSha, `FR-31 git blob ${path}`);
    files[path] = Object.freeze({
      byteLength: bytes.byteLength,
      gitBlobSha: computedBlobSha,
      sha256: sha256(bytes),
    });
  }

  const buildText = (await fetchBytes(`https://raw.githubusercontent.com/${REPOSITORY}/${TAG_COMMIT}/mediapipe/tasks/web/vision/BUILD`)).toString('utf8');
  assertIncludes(buildText, 'name = "vision_pkg"', 'FR-31 vision package target');
  assertIncludes(buildText, 'package_name = "@mediapipe/tasks-__NAME__"', 'FR-31 package name template');
  assertIncludes(buildText, 'tgz = "vision_pkg.tgz"', 'FR-31 tgz output');
  assertIncludes(buildText, '"__NAME__": "vision"', 'FR-31 name substitution');
  assertIncludes(buildText, '"__DESCRIPTION__": "MediaPipe Vision Tasks"', 'FR-31 description substitution');
  assertIncludes(buildText, '"__TYPES__": "vision.d.ts"', 'FR-31 types substitution');
  if (buildText.includes('"__VERSION__":')) {
    throw new Error('FR-31 vision_pkg unexpectedly gained an explicit __VERSION__ substitution; provenance contract requires review.');
  }

  const packageTemplate = (await fetchBytes(`https://raw.githubusercontent.com/${REPOSITORY}/${TAG_COMMIT}/mediapipe/tasks/web/package.json`)).toString('utf8');
  assertIncludes(packageTemplate, '"version": "__VERSION__"', 'FR-31 package version token');
  assertIncludes(packageTemplate, '"main": "__NAME___bundle.cjs"', 'FR-31 package CJS entry');
  assertIncludes(packageTemplate, '"browser": "__NAME___bundle.mjs"', 'FR-31 package browser entry');
  assertIncludes(packageTemplate, '"types": "__TYPES__"', 'FR-31 package type token');

  const bazelVersion = (await fetchBytes(`https://raw.githubusercontent.com/${REPOSITORY}/${TAG_COMMIT}/.bazelversion`)).toString('utf8').trim();
  assertEqual(bazelVersion, '7.4.1', 'FR-31 Bazel version');

  const rollupText = (await fetchBytes(`https://raw.githubusercontent.com/${REPOSITORY}/${TAG_COMMIT}/mediapipe/tasks/web/rollup.config.mjs`)).toString('utf8');
  assertIncludes(rollupText, 'treeshake: false', 'FR-31 Rollup treeshake');
  assertIncludes(rollupText, 'resolve()', 'FR-31 Rollup resolve plugin');
  assertIncludes(rollupText, 'commonjs()', 'FR-31 Rollup commonjs plugin');
  assertIncludes(rollupText, 'terser()', 'FR-31 Rollup terser plugin');

  const releaseResponse = await fetch(RELEASE_API_URL, { headers: { 'User-Agent': 'MyeongHa-FR31-Attestation' } });
  if (!releaseResponse.ok) throw new Error(`FR-31 release fetch failed: ${releaseResponse.status} ${releaseResponse.statusText}`);
  const release = await releaseResponse.json();
  assertEqual(release.id, 314747935, 'FR-31 release id');
  assertEqual(release.tag_name, 'v0.10.35', 'FR-31 release tag');
  assertEqual(release.name, 'MediaPipe v0.10.35', 'FR-31 release name');
  assertEqual(release.immutable, false, 'FR-31 release immutable state');
  assertEqual(Array.isArray(release.assets) ? release.assets.length : -1, 0, 'FR-31 observed release asset count');

  const result = Object.freeze({
    schemaVersion: 'fr31-probe-v1',
    authorityState: 'release_tag_build_recipe_identity_only',
    repository: REPOSITORY,
    tagCommitSha: TAG_COMMIT,
    files: Object.freeze(files),
    sourceAssertions: Object.freeze({
      bazelVersion: '7.4.1',
      visionPkgTargetObserved: true,
      explicitVersionSubstitutionObserved: false,
      packageVersionTokenObserved: true,
      rollupRecipeObserved: true,
    }),
    releaseObservation: Object.freeze({
      releaseId: release.id,
      tagName: release.tag_name,
      releaseName: release.name,
      immutable: release.immutable,
      assetsCount: release.assets.length,
      observationOnlyBecauseReleaseMutable: true,
    }),
    tagBuildExecutedByMyeongHa: false,
    rebuiltPackageContentsComparedToPublishedArtifact: false,
    publishedArtifactSourceBuildEquivalenceVerified: false,
    providerConformanceClaimed: false,
    productionProviderActivationAllowed: false,
    anatomicalLateralityResolved: false,
    traditionalSemanticAuthority: false,
  });

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
