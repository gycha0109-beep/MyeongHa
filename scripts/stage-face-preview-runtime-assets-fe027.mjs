import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import process from 'node:process';

const manifestPath = resolve(
  process.argv[2] ?? 'config/face-preview-runtime-assets-fe027.json',
);
const outputRoot = resolve(
  process.argv[3] ?? '.artifacts/fe027-face-preview-runtime-assets',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FE027 runtime asset staging failed: ${message}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert(
  manifest.schemaVersion === 'myeongha-face-preview-runtime-assets-manifest-v1' &&
    manifest.contractVersion === 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1' &&
    manifest.mediapipePackageVersion === '0.10.35' &&
    manifest.modelFamily === 'face_landmarker/float16/1',
  'manifest identity drift.',
);
assert(
  manifest.engineAssetConfig?.schemaVersion ===
    'fe022-digest-bound-mediapipe-model-config-v1' &&
    manifest.engineAssetConfig?.wasmRoot ===
      '/face-preview/mediapipe/0.10.35/wasm' &&
    manifest.engineAssetConfig?.modelAssetPath ===
      '/face-preview/models/face_landmarker.float16.v1.task' &&
    /^[0-9a-f]{64}$/u.test(manifest.engineAssetConfig?.modelAssetSha256 ?? ''),
  'engine asset config drift.',
);
assert(Array.isArray(manifest.assets) && manifest.assets.length === 7, 'asset set drift.');

await rm(outputRoot, { recursive: true, force: true });

const staged = [];
for (const asset of manifest.assets) {
  assert(
    typeof asset.key === 'string' &&
      typeof asset.source === 'string' &&
      asset.source.startsWith('https://') &&
      typeof asset.outputPath === 'string' &&
      !asset.outputPath.startsWith('/') &&
      !asset.outputPath.split('/').includes('..') &&
      Number.isSafeInteger(asset.bytes) &&
      asset.bytes > 0 &&
      /^[0-9a-f]{64}$/u.test(asset.sha256),
    `invalid manifest entry: ${asset.key ?? 'unknown'}`,
  );

  const response = await fetch(asset.source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  assert(response.ok, `${asset.key} returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert(bytes.byteLength === asset.bytes, `${asset.key} byte size drift.`);
  assert(digest === asset.sha256, `${asset.key} SHA-256 drift.`);

  const outputPath = resolve(outputRoot, asset.outputPath);
  assert(
    outputPath.startsWith(outputRoot + sep),
    `${asset.key} output escaped the staging root.`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  staged.push(Object.freeze({
    key: asset.key,
    outputPath: asset.outputPath,
    bytes: asset.bytes,
    sha256: asset.sha256,
  }));
}

const runtimeConfigPath = resolve(outputRoot, 'face-preview/runtime-assets.json');
await mkdir(dirname(runtimeConfigPath), { recursive: true });
await writeFile(
  runtimeConfigPath,
  JSON.stringify({
    schemaVersion: 'myeongha-face-preview-runtime-config-v1',
    contractVersion: manifest.contractVersion,
    assets: manifest.engineAssetConfig,
    verification: {
      modelBytesVerifiedAtBuild: true,
      wasmBytesVerifiedAtBuild: true,
      userImageBytesIncluded: false,
    },
  }, null, 2) + '\n',
  'utf8',
);

process.stdout.write(`${JSON.stringify({
  status: 'FE027_FACE_PREVIEW_RUNTIME_ASSETS_STAGED',
  outputRoot,
  assetCount: staged.length,
  totalBytes: staged.reduce((sum, entry) => sum + entry.bytes, 0),
  modelSha256: manifest.engineAssetConfig.modelAssetSha256,
  wasmBytesVerifiedAtBuild: true,
  userImageBytesIncluded: false,
})}\n`);
