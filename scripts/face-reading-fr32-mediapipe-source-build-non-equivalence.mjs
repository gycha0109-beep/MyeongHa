import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PACKAGE_NAME = '@mediapipe/tasks-vision';
const PACKAGE_VERSION = '0.10.35';
const TARBALL_URL = 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz';
const EXPECTED_PUBLISHED_TARBALL_BYTES = 10231005;
const EXPECTED_PUBLISHED_TARBALL_SHA256 = 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0';
const SOURCE_COMMIT = 'f8ef212d5c962c0e853db7e59d217056b187084b';
const SOURCE_TAG = 'v0.10.35';
const BAZEL_VERSION = '7.4.1';
const TARGET = '//mediapipe/tasks/web/vision:vision_pkg';
const OUTPUT_PATH = 'artifacts/face-reading/fr32-mediapipe-source-build-non-equivalence.json';
const SELECTED_RUNTIME_FILES = Object.freeze([
  'vision_bundle.cjs',
  'vision_bundle.mjs',
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_module_internal.js',
  'wasm/vision_wasm_module_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm',
]);
const WASM_FILES = Object.freeze(SELECTED_RUNTIME_FILES.filter((path) => path.startsWith('wasm/')));

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function evidence(path) {
  const bytes = readFileSync(path);
  return Object.freeze({ byteLength: bytes.byteLength, sha256: sha256(bytes) });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function assertNotEqual(actual, unexpected, label) {
  if (actual === unexpected) throw new Error(`${label} unexpectedly matched: ${actual}`);
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`FR-32 registry fetch failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

function findPackageRoot(root) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const packageJsonPath = join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (parsed.name === PACKAGE_NAME) return current;
      } catch {
      }
    }
    for (const entry of readdirSync(current)) {
      const child = join(current, entry);
      if (statSync(child).isDirectory()) stack.push(child);
    }
  }
  throw new Error(`FR-32 could not locate ${PACKAGE_NAME} in extracted source package tar.`);
}

async function main() {
  const sourceTarPath = process.argv[2];
  if (!sourceTarPath) throw new Error('Usage: node scripts/face-reading-fr32-mediapipe-source-build-non-equivalence.mjs <vision_pkg.tar>');
  if (!existsSync(sourceTarPath)) throw new Error(`FR-32 source package tar not found: ${sourceTarPath}`);

  const workspace = mkdtempSync(join(tmpdir(), 'myeongha-fr32-'));
  try {
    const sourceArchiveEntries = execFileSync('tar', ['-tf', sourceTarPath], { encoding: 'utf8' })
      .split('\n').map((value) => value.trim()).filter(Boolean).sort();
    const sourceExtractRoot = join(workspace, 'source');
    mkdirSync(sourceExtractRoot, { recursive: true });
    execFileSync('tar', ['-xf', sourceTarPath, '-C', sourceExtractRoot]);
    const sourcePackageRoot = findPackageRoot(sourceExtractRoot);

    const publishedTarballBytes = await fetchBytes(TARBALL_URL);
    assertEqual(publishedTarballBytes.byteLength, EXPECTED_PUBLISHED_TARBALL_BYTES, 'FR-32 published tarball byte length');
    assertEqual(sha256(publishedTarballBytes), EXPECTED_PUBLISHED_TARBALL_SHA256, 'FR-32 published tarball SHA-256');
    const publishedTarPath = join(workspace, 'tasks-vision-0.10.35.tgz');
    writeFileSync(publishedTarPath, publishedTarballBytes);
    const publishedExtractRoot = join(workspace, 'published');
    mkdirSync(publishedExtractRoot, { recursive: true });
    execFileSync('tar', ['-xzf', publishedTarPath, '-C', publishedExtractRoot]);
    const publishedPackageRoot = join(publishedExtractRoot, 'package');

    const sourcePackageJson = JSON.parse(readFileSync(join(sourcePackageRoot, 'package.json'), 'utf8'));
    const publishedPackageJson = JSON.parse(readFileSync(join(publishedPackageRoot, 'package.json'), 'utf8'));
    assertEqual(sourcePackageJson.name, PACKAGE_NAME, 'FR-32 source package name');
    assertEqual(sourcePackageJson.version, '__VERSION__', 'FR-32 source package unresolved version placeholder');
    assertEqual(publishedPackageJson.name, PACKAGE_NAME, 'FR-32 published package name');
    assertEqual(publishedPackageJson.version, PACKAGE_VERSION, 'FR-32 published package version');

    const sourceVisionDtsPresent = existsSync(join(sourcePackageRoot, 'vision.d.ts'));
    const publishedVisionDtsPresent = existsSync(join(publishedPackageRoot, 'vision.d.ts'));
    assertEqual(sourceVisionDtsPresent, false, 'FR-32 source vision.d.ts presence');
    assertEqual(publishedVisionDtsPresent, true, 'FR-32 published vision.d.ts presence');

    const comparisons = {};
    for (const relativePath of SELECTED_RUNTIME_FILES) {
      const source = evidence(join(sourcePackageRoot, relativePath));
      const published = evidence(join(publishedPackageRoot, relativePath));
      const sha256Equal = source.sha256 === published.sha256;
      const byteLengthEqual = source.byteLength === published.byteLength;
      assertNotEqual(source.sha256, published.sha256, `FR-32 source/published digest ${relativePath}`);
      comparisons[relativePath] = Object.freeze({
        sourcePath: relativePath,
        publishedPath: relativePath,
        source,
        published,
        sha256Equal,
        byteLengthEqual,
      });
    }

    const wasmComparisons = WASM_FILES.map((path) => comparisons[path]);
    const bundleComparisons = ['vision_bundle.cjs', 'vision_bundle.mjs'].map((path) => comparisons[path]);
    const allSixWasmSha256Differ = wasmComparisons.every((entry) => entry.sha256Equal === false);
    const allSixWasmByteLengthsDiffer = wasmComparisons.every((entry) => entry.byteLengthEqual === false);
    const bothBundleSha256Differ = bundleComparisons.every((entry) => entry.sha256Equal === false);
    assertEqual(allSixWasmSha256Differ, true, 'FR-32 all WASM digests differ');
    assertEqual(bothBundleSha256Differ, true, 'FR-32 both bundle digests differ');

    const result = Object.freeze({
      schemaVersion: 'fr32-measurement-v1',
      authorityState: 'public_release_tag_target_measured_non_equivalence_only',
      sourceIdentity: Object.freeze({
        repository: 'google-ai-edge/mediapipe', tag: SOURCE_TAG, commitSha: SOURCE_COMMIT,
        bazelVersion: BAZEL_VERSION, target: TARGET,
      }),
      publishedArtifact: Object.freeze({
        packageName: PACKAGE_NAME, packageVersion: PACKAGE_VERSION, tarballUrl: TARBALL_URL,
        tarballByteLength: publishedTarballBytes.byteLength, tarballSha256: sha256(publishedTarballBytes),
      }),
      sourcePackage: Object.freeze({
        archiveEntryCount: sourceArchiveEntries.length,
        sortedArchiveEntriesSha256: sha256(Buffer.from(`${sourceArchiveEntries.join('\n')}\n`, 'utf8')),
        packageJsonVersion: sourcePackageJson.version,
        packageJsonVersionPlaceholderUnresolved: sourcePackageJson.version === '__VERSION__',
        visionDtsPresent: sourceVisionDtsPresent,
      }),
      publishedPackage: Object.freeze({ packageJsonVersion: publishedPackageJson.version, visionDtsPresent: publishedVisionDtsPresent }),
      comparisons: Object.freeze(comparisons),
      allSixWasmSha256Differ,
      allSixWasmByteLengthsDiffer,
      bothBundleSha256Differ,
      publicTagTargetPublishedArtifactByteEquivalent: false,
      publishedReleaseProcessIdentified: false,
      providerConformanceClaimed: false,
      productionProviderActivationAllowed: false,
      anatomicalLateralityResolved: false,
      traditionalSemanticAuthority: false,
    });

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
