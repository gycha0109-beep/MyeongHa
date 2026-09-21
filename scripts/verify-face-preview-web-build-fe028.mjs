import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const manifestPath = resolve('config/face-preview-runtime-assets-fe027.json');
const outputRoot = resolve(
  process.argv[2] ??
    process.env.MYEONGHA_WEB_OUTPUT_DIR ??
    'public',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FE028 web asset verification failed: ${message}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const runtimePath = resolve(outputRoot, 'face-preview/runtime-assets.json');
const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));

assert(
  runtime.schemaVersion === 'myeongha-face-preview-runtime-config-v1' &&
    runtime.contractVersion === 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1',
  'runtime config identity drift.',
);
assert(
  JSON.stringify(runtime.assets) === JSON.stringify(manifest.engineAssetConfig),
  'runtime asset config does not match FE027 manifest.',
);
assert(
  runtime.verification?.modelBytesVerifiedAtBuild === true &&
    runtime.verification?.wasmBytesVerifiedAtBuild === true &&
    runtime.verification?.userImageBytesIncluded === false,
  'runtime verification receipt drift.',
);

for (const asset of manifest.assets) {
  const bytes = await readFile(resolve(outputRoot, asset.outputPath));
  assert(bytes.byteLength === asset.bytes, `${asset.key} byte size mismatch.`);
  assert(
    createHash('sha256').update(bytes).digest('hex') === asset.sha256,
    `${asset.key} SHA-256 mismatch.`,
  );
}

const modelFiles = (await readdir(resolve(outputRoot, 'face-preview/models'))).sort();
const wasmFiles = (
  await readdir(resolve(outputRoot, 'face-preview/mediapipe/0.10.35/wasm'))
).sort();
const expectedModelFiles = manifest.assets
  .filter((asset) => asset.outputPath.includes('/models/'))
  .map((asset) => asset.outputPath.split('/').at(-1))
  .sort();
const expectedWasmFiles = manifest.assets
  .filter((asset) => asset.outputPath.includes('/wasm/'))
  .map((asset) => asset.outputPath.split('/').at(-1))
  .sort();

assert(
  JSON.stringify(modelFiles) === JSON.stringify(expectedModelFiles),
  'model output contains unexpected files.',
);
assert(
  JSON.stringify(wasmFiles) === JSON.stringify(expectedWasmFiles),
  'WASM output contains unexpected files.',
);
assert((await stat(resolve(outputRoot, 'index.html'))).isFile(), 'web index output missing.');

const facePreviewRootEntries = (
  await readdir(resolve(outputRoot, 'face-preview'))
).sort();
assert(
  JSON.stringify(facePreviewRootEntries) ===
    JSON.stringify(['mediapipe', 'models', 'runtime-assets.json']),
  'Face Preview output root widened.',
);

process.stdout.write(`${JSON.stringify({
  status: 'FE028_FACE_PREVIEW_WEB_ASSETS_PASS',
  outputRoot,
  assetCount: manifest.assets.length,
  modelSha256: manifest.engineAssetConfig.modelAssetSha256,
  sameOriginWasmRoot: manifest.engineAssetConfig.wasmRoot,
  sameOriginModelPath: manifest.engineAssetConfig.modelAssetPath,
  userImageBytesIncluded: false,
})}\n`);
