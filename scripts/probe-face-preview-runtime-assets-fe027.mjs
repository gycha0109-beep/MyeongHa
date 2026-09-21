import { createHash } from 'node:crypto';

const ASSETS = Object.freeze([
  {
    key: 'face_landmarker.task',
    source:
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  ...[
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
    'vision_wasm_module_internal.js',
    'vision_wasm_module_internal.wasm',
    'vision_wasm_nosimd_internal.js',
    'vision_wasm_nosimd_internal.wasm',
  ].map((filename) => ({
    key: filename,
    source:
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm/${filename}`,
  })),
]);

async function fetchAsset(asset) {
  const response = await fetch(asset.source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(
      `FE027 failed to fetch ${asset.key}: HTTP ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new Error(`FE027 fetched empty asset: ${asset.key}`);
  }
  return Object.freeze({
    key: asset.key,
    source: asset.source,
    resolvedSource: response.url,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    contentType: response.headers.get('content-type'),
  });
}

const results = [];
for (const asset of ASSETS) {
  results.push(await fetchAsset(asset));
}

process.stdout.write(
  `${JSON.stringify({
    status: 'FE027_FACE_PREVIEW_RUNTIME_ASSET_PROBE_PASS',
    mediapipePackageVersion: '0.10.35',
    modelFamily: 'face_landmarker/float16/1',
    assets: results,
  })}\n`,
);
