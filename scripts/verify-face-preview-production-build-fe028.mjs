import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';

const outputRoot = resolve(
  process.cwd(),
  process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public',
);
const manifest = JSON.parse(
  await readFile(
    resolve('config/face-preview-runtime-assets-fe027.json'),
    'utf8',
  ),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FE028 production build smoke failed: ${message}`);
  }
}

const expectedPaths = [
  'face-preview/runtime-assets.json',
  ...manifest.assets.map((asset) => asset.outputPath),
];

for (const path of expectedPaths) {
  const info = await stat(resolve(outputRoot, path));
  assert(info.isFile() && info.size > 0, `missing deployment asset: ${path}`);
}

const mime = new Map([
  ['.json', 'application/json'],
  ['.js', 'text/javascript'],
  ['.wasm', 'application/wasm'],
  ['.task', 'application/octet-stream'],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
    );
    const filePath = resolve(outputRoot, pathname.replace(/^\/+/, ''));
    if (
      filePath !== outputRoot &&
      !filePath.startsWith(outputRoot + sep)
    ) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(filePath);
    response.writeHead(200, {
      'content-type': mime.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolvePromise, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolvePromise);
});

try {
  const address = server.address();
  assert(
    typeof address === 'object' && address !== null,
    'static smoke server did not bind.',
  );
  const origin = `http://127.0.0.1:${address.port}`;

  const runtimeResponse = await fetch(
    `${origin}/face-preview/runtime-assets.json`,
  );
  assert(runtimeResponse.ok, 'runtime-assets.json was not fetchable.');
  const runtime = await runtimeResponse.json();
  assert(
    runtime.schemaVersion === 'myeongha-face-preview-runtime-config-v1' &&
      runtime.contractVersion === 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1' &&
      JSON.stringify(runtime.assets) ===
        JSON.stringify(manifest.engineAssetConfig) &&
      runtime.verification?.modelBytesVerifiedAtBuild === true &&
      runtime.verification?.wasmBytesVerifiedAtBuild === true &&
      runtime.verification?.userImageBytesIncluded === false,
    'runtime-assets.json deployment contract drift.',
  );

  for (const asset of manifest.assets) {
    const response = await fetch(`${origin}/${asset.outputPath}`);
    assert(response.ok, `${asset.key} was not fetchable.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(
      bytes.byteLength === asset.bytes,
      `${asset.key} deployed byte size drift.`,
    );
    if (asset.outputPath.endsWith('.wasm')) {
      assert(
        response.headers.get('content-type') === 'application/wasm',
        `${asset.key} WASM MIME drift.`,
      );
    }
  }

  process.stdout.write(`${JSON.stringify({
    status: 'FE028_FACE_PREVIEW_PRODUCTION_BUILD_PASS',
    outputRoot,
    runtimeConfigPath: '/face-preview/runtime-assets.json',
    assetCount: manifest.assets.length,
    modelSha256: manifest.engineAssetConfig.modelAssetSha256,
    allAssetsFetchable: true,
    wasmMimeVerified: true,
    userImageBytesIncluded: false,
  })}\n`);
} finally {
  await new Promise((resolvePromise) => server.close(resolvePromise));
}
