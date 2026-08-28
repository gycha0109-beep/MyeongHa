import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const PACKAGE_NAME = '@mediapipe/tasks-vision';
const PACKAGE_VERSION = '0.10.35';
const TARBALL_URL = 'https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.35.tgz';
const EXPECTED_SRI = 'sha512-HOvadwVRE6JC+45nyYhmnywnr5h/J8KZvOeUNVOG9q/0875pZgItznFB9bRTvLc264YSJqiZ1NsIpCStJw/egg==';
const EXPECTED_TARBALL_BYTE_LENGTH = 10231005;
const EXPECTED_TARBALL_SHA512_HEX = '1cebda77055113a242fb8e67c988669f2c27af987f27c299bce794355386f6aff4f3be6966022dce7141f5b453bcb736eb861226a899d4db08a424ad270fde82';
const EXPECTED_TARBALL_SHA256 = 'sha256:84597a25e13d123b5f4cbe768bb72e97a2c28c7a465f0ace287d8cbe5246bff0';
const EXPECTED_ARCHIVE_ENTRY_COUNT = 13;
const EXPECTED_ARCHIVE_ENTRIES_SHA256 = 'sha256:c9f26f4d68b9099272d6b2caca5b9658e5b7f2e06654af513b83bd32ae895d2f';
const OUTPUT_PATH = 'artifacts/face-reading/fr30-npm-artifact-byte-attestation.json';

const EXPECTED_FILES = Object.freeze({
  'package.json': Object.freeze({ byteLength: 1084, sha256: 'sha256:5c96247445e57a2d087758114b116fed7d46eb401342aee19b1acc56d36fe707' }),
  'vision_bundle.mjs': Object.freeze({ byteLength: 136993, sha256: 'sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe' }),
  'vision_bundle.cjs': Object.freeze({ byteLength: 137566, sha256: 'sha256:7fba4f9807297e229371318df577e96fc9f1b3d93e79075e3798ade2fc790c9e' }),
  'vision.d.ts': Object.freeze({ byteLength: 116918, sha256: 'sha256:3825dba564fc06720dc0934b72a22711ac6b7491ae8662e573ac205699ea016b' }),
  'wasm/vision_wasm_internal.js': Object.freeze({ byteLength: 322044, sha256: 'sha256:e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c' }),
  'wasm/vision_wasm_internal.wasm': Object.freeze({ byteLength: 11153617, sha256: 'sha256:6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc' }),
  'wasm/vision_wasm_module_internal.js': Object.freeze({ byteLength: 322082, sha256: 'sha256:1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44' }),
  'wasm/vision_wasm_module_internal.wasm': Object.freeze({ byteLength: 11153641, sha256: 'sha256:617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756' }),
  'wasm/vision_wasm_nosimd_internal.js': Object.freeze({ byteLength: 321847, sha256: 'sha256:438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296' }),
  'wasm/vision_wasm_nosimd_internal.wasm': Object.freeze({ byteLength: 10481398, sha256: 'sha256:8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31' }),
});

function hash(buffer, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function sha256(buffer) {
  return `sha256:${hash(buffer, 'sha256')}`;
}

function fileEvidence(path) {
  const bytes = readFileSync(path);
  return Object.freeze({ byteLength: bytes.byteLength, sha256: sha256(bytes) });
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`FR-30 registry fetch failed: ${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), 'myeongha-fr30-'));
  try {
    const tarballBytes = await fetchBytes(TARBALL_URL);
    const tarballPath = join(workspace, 'tasks-vision-0.10.35.tgz');
    writeFileSync(tarballPath, tarballBytes);

    const computedSri = `sha512-${hash(tarballBytes, 'sha512', 'base64')}`;
    const computedSha512Hex = hash(tarballBytes, 'sha512');
    const computedSha256 = sha256(tarballBytes);
    assertEqual(tarballBytes.byteLength, EXPECTED_TARBALL_BYTE_LENGTH, 'FR-30 tarball byte length');
    assertEqual(computedSri, EXPECTED_SRI, 'FR-30 tarball SRI');
    assertEqual(computedSha512Hex, EXPECTED_TARBALL_SHA512_HEX, 'FR-30 tarball SHA-512 hex');
    assertEqual(computedSha256, EXPECTED_TARBALL_SHA256, 'FR-30 tarball SHA-256');

    const archiveEntries = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();
    const archiveEntriesSha256 = sha256(Buffer.from(`${archiveEntries.join('\n')}\n`, 'utf8'));
    assertEqual(archiveEntries.length, EXPECTED_ARCHIVE_ENTRY_COUNT, 'FR-30 archive entry count');
    assertEqual(archiveEntriesSha256, EXPECTED_ARCHIVE_ENTRIES_SHA256, 'FR-30 archive entry manifest');

    const extractRoot = join(workspace, 'extract');
    mkdirSync(extractRoot, { recursive: true });
    execFileSync('tar', ['-xzf', tarballPath, '-C', extractRoot]);

    const extractedPackageRoot = join(extractRoot, 'package');
    const installedPackageRoot = join(process.cwd(), 'node_modules', '@mediapipe', 'tasks-vision');
    const selectedFiles = {};

    for (const [relativePath, expected] of Object.entries(EXPECTED_FILES)) {
      const extracted = fileEvidence(join(extractedPackageRoot, relativePath));
      const installed = fileEvidence(join(installedPackageRoot, relativePath));
      assertEqual(extracted.byteLength, expected.byteLength, `FR-30 published byte length ${relativePath}`);
      assertEqual(extracted.sha256, expected.sha256, `FR-30 published digest ${relativePath}`);
      assertEqual(installed.byteLength, extracted.byteLength, `FR-30 installed byte length ${relativePath}`);
      assertEqual(installed.sha256, extracted.sha256, `FR-30 installed digest ${relativePath}`);
      selectedFiles[relativePath] = Object.freeze({ ...extracted, installedByteIdentical: true });
    }

    const packageMetadata = JSON.parse(readFileSync(join(extractedPackageRoot, 'package.json'), 'utf8'));
    assertEqual(packageMetadata.name, PACKAGE_NAME, 'FR-30 package name');
    assertEqual(packageMetadata.version, PACKAGE_VERSION, 'FR-30 package version');
    assertEqual(packageMetadata.main, 'vision_bundle.cjs', 'FR-30 main entry');
    assertEqual(packageMetadata.browser, 'vision_bundle.mjs', 'FR-30 browser entry');
    assertEqual(packageMetadata.module, 'vision_bundle.mjs', 'FR-30 module entry');
    assertEqual(packageMetadata.types, 'vision.d.ts', 'FR-30 type entry');
    assertEqual(Object.prototype.hasOwnProperty.call(packageMetadata, 'repository'), false, 'FR-30 repository field presence');
    assertEqual(Object.prototype.hasOwnProperty.call(packageMetadata, 'gitHead'), false, 'FR-30 gitHead field presence');

    const result = Object.freeze({
      schemaVersion: 'fr30-v1',
      authorityState: 'published_npm_artifact_byte_identity_only',
      packageName: PACKAGE_NAME,
      packageVersion: PACKAGE_VERSION,
      tarballUrl: TARBALL_URL,
      tarball: Object.freeze({
        byteLength: tarballBytes.byteLength,
        sha512Sri: computedSri,
        sha512Hex: computedSha512Hex,
        sha256: computedSha256,
        independentlyFetchedAndRehashed: true,
        lockfileSriMatched: true,
      }),
      archive: Object.freeze({ entryCount: archiveEntries.length, sortedEntriesSha256: archiveEntriesSha256 }),
      packageMetadata: Object.freeze({
        main: packageMetadata.main,
        browser: packageMetadata.browser,
        module: packageMetadata.module,
        types: packageMetadata.types,
        repositoryFieldObserved: false,
        gitHeadFieldObserved: false,
      }),
      selectedFiles: Object.freeze(selectedFiles),
      allSelectedFilesByteIdenticalToInstalledPackage: true,
      sourceOrBuildEquivalenceToReleaseTagVerified: false,
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
