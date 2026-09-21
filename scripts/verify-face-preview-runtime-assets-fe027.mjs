import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const manifestPath = resolve(
  process.argv[2] ?? 'config/face-preview-runtime-assets-fe027.json',
);
const outputRoot = resolve(
  process.argv[3] ??
    process.env.MYEONGHA_WEB_OUTPUT_DIR ??
    'public',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FE027 staged asset verification failed: ${message}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const runtime = JSON.parse(
  await readFile(resolve(outputRoot, 'face-preview/runtime-assets.json'), 'utf8'),
);

assert(
  runtime.schemaVersion === 'myeongha-face-preview-runtime-config-v1' &&
    runtime.contractVersion === 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1',
  'runtime config identity drift.',
);
assert(
  JSON.stringify(runtime.assets) === JSON.stringify(manifest.engineAssetConfig),
  'runtime engine asset config drift.',
);
assert(
  runtime.verification?.modelBytesVerifiedAtBuild === true &&
    runtime.verification?.wasmBytesVerifiedAtBuild === true &&
    runtime.verification?.userImageBytesIncluded === false,
  'runtime verification receipt drift.',
);

for (const asset of manifest.assets) {
  const bytes = await readFile(resolve(outputRoot, asset.outputPath));
  assert(bytes.byteLength === asset.bytes, `${asset.key} staged byte size mismatch.`);
  assert(
    createHash('sha256').update(bytes).digest('hex') === asset.sha256,
    `${asset.key} staged SHA-256 mismatch.`,
  );
}

const modelFiles = await readdir(resolve(outputRoot, 'face-preview/models'));
const wasmFiles = await readdir(resolve(outputRoot, 'face-preview/mediapipe/0.10.35/wasm'));
assert(modelFiles.length === 1, 'unexpected model file count.');
assert(wasmFiles.length === 6, 'unexpected WASM file count.');

process.stdout.write(`${JSON.stringify({
  status: 'FE027_FACE_PREVIEW_RUNTIME_ASSETS_PASS',
  assetCount: manifest.assets.length,
  modelSha256: manifest.engineAssetConfig.modelAssetSha256,
  sameOriginWasmRoot: manifest.engineAssetConfig.wasmRoot,
  sameOriginModelPath: manifest.engineAssetConfig.modelAssetPath,
})}\n`);