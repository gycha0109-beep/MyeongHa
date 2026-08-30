import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, realpath, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  buildMentonDatasetProviderFaceCandidateObservationReportFRData06,
  validateMediaPipeRealRuntimeVerificationEvidenceFR27,
  validateMentonDatasetIntakeManifestFRData01,
} from '../dist/packages/face-reading/src/index.js';
import { verifyMentonDatasetAssetFilesFRData01 } from './face-reading-fr-data01-menton-dataset-intake.mjs';
import { inspectMentonDatasetImageDimensionsFRData02 } from './face-reading-fr-data02-image-dimensions.mjs';

const CDP_PORT = 9228;
const delay = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`FR-DATA-06 ${label} mismatch: expected ${expected}, received ${actual}`);
}

function assertConfined(root, target, captureRef) {
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`FR-DATA-06 capture ${captureRef} resolves outside the declared asset root.`);
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return { path: candidate, version: probe.stdout.trim() || probe.stderr.trim() };
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const which = spawnSync('which', [name], { encoding: 'utf8' });
    if (which.status !== 0 || !which.stdout.trim()) continue;
    const candidate = which.stdout.trim();
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return { path: candidate, version: probe.stdout.trim() || probe.stderr.trim() };
  }
  throw new Error('FR-DATA-06 requires an installed Chrome/Chromium binary; none was found.');
}

function browserProduct(version) {
  if (version.startsWith('Google Chrome')) return 'Google Chrome';
  if (version.startsWith('Chromium')) return 'Chromium';
  throw new Error(`FR-DATA-06 unsupported browser product string: ${version}`);
}

function mime(path, fallback = 'application/octet-stream') {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.wasm': return 'application/wasm';
    default: return fallback;
  }
}

async function download(url, path) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`FR-DATA-06 download failed ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
}

async function waitForPageTarget(pageUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((entry) => entry.type === 'page' && entry.url === pageUrl);
        if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      }
    } catch {}
    await delay(100);
  }
  throw new Error('FR-DATA-06 could not discover Chrome DevTools page target.');
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', () => rejectPromise(new Error('FR-DATA-06 CDP WebSocket connection failed.')), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(`CDP ${waiter.method} failed: ${JSON.stringify(message.error)}`));
    else waiter.resolve(message.result);
  });
  const command = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  await command('Runtime.enable');
  return { ws, command };
}

async function waitForPageReady(cdp, pageUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await cdp.command('Runtime.evaluate', {
      expression: '({ url: location.href, origin: location.origin, readyState: document.readyState })',
      returnByValue: true,
    });
    const value = result.result?.value;
    if (value?.url === pageUrl && (value.readyState === 'interactive' || value.readyState === 'complete')) return value;
    await delay(50);
  }
  throw new Error('FR-DATA-06 browser page did not become ready.');
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit').catch(() => []);
  child.kill('SIGKILL');
  await Promise.race([exited, delay(3000)]);
}

async function prepareAssets(manifest, assetRootInput, verifiedAssets, qualityReport) {
  const assetRoot = await realpath(resolve(assetRootInput));
  const records = [];
  for (const [index, binding] of manifest.assets.entries()) {
    const verified = verifiedAssets.find((entry) => entry.captureRef === binding.captureRef);
    const quality = qualityReport.captureObservations.find((entry) => entry.captureRef === binding.captureRef);
    if (!verified || !quality) throw new Error(`FR-DATA-06 missing prerequisite binding for ${binding.captureRef}.`);
    if (verified.relativeAssetPath !== binding.relativeAssetPath || quality.relativeAssetPath !== binding.relativeAssetPath) {
      throw new Error(`FR-DATA-06 path drift for ${binding.captureRef}.`);
    }
    if (verified.actualDigest !== quality.actualDigest) throw new Error(`FR-DATA-06 asset digest drift for ${binding.captureRef}.`);
    const target = await realpath(resolve(assetRoot, ...binding.relativeAssetPath.split('/')));
    assertConfined(assetRoot, target, binding.captureRef);
    records.push(Object.freeze({
      captureRef: binding.captureRef,
      relativeAssetPath: binding.relativeAssetPath,
      actualDigest: verified.actualDigest,
      rasterSha256: quality.rasterSha256,
      route: `/assets/${index}${extname(target).toLowerCase()}`,
      target,
      contentSignature: verified.contentSignature,
    }));
  }
  return Object.freeze(records);
}

function pageExpression(records) {
  const assets = records.map(({ captureRef, relativeAssetPath, actualDigest, rasterSha256, route }) => ({
    captureRef, relativeAssetPath, actualDigest, rasterSha256, route,
  }));
  return `
(async () => {
  const vision = await import('/vendor/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(location.origin + '/vendor/wasm');
  const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: location.origin + '/assets/face_landmarker.task' },
    runningMode: 'IMAGE', numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  const assets = ${JSON.stringify(assets)};
  const sha = async (rgba) => {
    const copied = new Uint8Array(rgba.length); copied.set(rgba);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copied.buffer));
    return 'sha256:' + [...digest].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const inspect = async (entry, replay) => {
    const base = { captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath, actualDigest: entry.actualDigest, rasterSha256: entry.rasterSha256 };
    try {
      const image = new Image(); image.src = entry.route + '?replay=' + replay;
      await new Promise((ok, bad) => { image.onload = ok; image.onerror = () => bad(new Error('image_load_failed')); });
      await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('canvas_2d_context_unavailable');
      context.drawImage(image, 0, 0);
      const rasterDigest = await sha(context.getImageData(0, 0, canvas.width, canvas.height).data);
      if (rasterDigest !== entry.rasterSha256) return {
        ...base, status: 'provider_error', rasterIdentityReconfirmedBeforeProviderRun: false,
        providerResultRootFieldSet: null, faceCandidateCount: null, candidateSummaries: null,
        faceBlendshapeCount: null, facialTransformationMatrixCount: null,
        errorCode: 'raster_sha256_mismatch_from_fr_data05',
      };
      const result = landmarker.detect(image);
      const candidateSummaries = result.faceLandmarks.map((face, providerCandidateOrdinal) => ({
        providerCandidateOrdinal,
        landmarkCount: face.length,
        landmarkFieldSet: [...new Set(face.flatMap((landmark) => Object.keys(landmark)))].sort(),
        allXFiniteNormalized: face.every((landmark) => Number.isFinite(landmark.x) && landmark.x >= 0 && landmark.x <= 1),
        allYFiniteNormalized: face.every((landmark) => Number.isFinite(landmark.y) && landmark.y >= 0 && landmark.y <= 1),
        allZFinite: face.every((landmark) => Number.isFinite(landmark.z)),
        allVisibilityFiniteWhenPresent: face.every((landmark) => landmark.visibility === undefined || Number.isFinite(landmark.visibility)),
      }));
      return {
        ...base, status: 'observed', rasterIdentityReconfirmedBeforeProviderRun: true,
        providerResultRootFieldSet: Object.keys(result).sort(),
        faceCandidateCount: result.faceLandmarks.length, candidateSummaries,
        faceBlendshapeCount: result.faceBlendshapes.length,
        facialTransformationMatrixCount: result.facialTransformationMatrixes.length,
        errorCode: null,
      };
    } catch (error) {
      return {
        ...base, status: 'provider_error', rasterIdentityReconfirmedBeforeProviderRun: false,
        providerResultRootFieldSet: null, faceCandidateCount: null, candidateSummaries: null,
        faceBlendshapeCount: null, facialTransformationMatrixCount: null,
        errorCode: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const run = async (replay) => { const out = []; for (const entry of assets) out.push(await inspect(entry, replay)); return out; };
  try {
    const first = await run(1); const second = await run(2);
    return { first, second, deterministicSummaryReplay: JSON.stringify(first) === JSON.stringify(second) };
  } finally { landmarker.close(); }
})()
`;
}

export async function runMentonDatasetProviderFaceCandidateObservationsFRData06(
  manifestPathInput,
  assetRootInput,
  pixelReportPathInput,
  qualityReportPathInput,
  reportPathInput,
) {
  validateMediaPipeRealRuntimeVerificationEvidenceFR27();
  const verifiedRuntime = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
  const manifest = JSON.parse(await readFile(resolve(manifestPathInput), 'utf8'));
  validateMentonDatasetIntakeManifestFRData01(manifest);
  const pixelReport = JSON.parse(await readFile(resolve(pixelReportPathInput), 'utf8'));
  const qualityReport = JSON.parse(await readFile(resolve(qualityReportPathInput), 'utf8'));
  const verifiedAssets = await verifyMentonDatasetAssetFilesFRData01(manifest, assetRootInput);
  const intakeReport = buildMentonDatasetIntakeReportFRData01(manifest, verifiedAssets);
  const dimensionEvidence = await inspectMentonDatasetImageDimensionsFRData02(manifest, assetRootInput);
  const dimensionReport = buildMentonDatasetImageDimensionReportFRData02(manifest, dimensionEvidence);
  const assetRecords = await prepareAssets(manifest, assetRootInput, verifiedAssets, qualityReport);

  const bundlePath = fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision'));
  const packageRoot = dirname(bundlePath);
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assertEqual(packageJson.version, verifiedRuntime.runtimePackageVersion, 'runtime package version');
  const packageBundleDigest = sha256(await readFile(bundlePath));
  assertEqual(packageBundleDigest, verifiedRuntime.installedPackageAssets.packageBundleDigest, 'package bundle digest');
  const wasmDir = join(packageRoot, 'wasm');
  const wasmFiles = [];
  for (const file of (await readdir(wasmDir)).sort()) {
    const path = join(wasmDir, file);
    if ((await stat(path)).isFile()) wasmFiles.push(Object.freeze({ file, digest: sha256(await readFile(path)) }));
  }
  const expectedWasm = [...verifiedRuntime.installedPackageAssets.wasmFiles].sort((a, b) => a.file.localeCompare(b.file));
  const actualWasm = [...wasmFiles].sort((a, b) => a.file.localeCompare(b.file));
  if (JSON.stringify(actualWasm) !== JSON.stringify(expectedWasm)) throw new Error('FR-DATA-06 installed WASM digest set mismatch.');

  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-fr-data06-'));
  const modelPath = join(scratch, 'face_landmarker.task');
  const modelBytes = await download(FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL, modelPath);
  const modelDigest = sha256(modelBytes);
  assertEqual(modelDigest, verifiedRuntime.model.independentByteDigest, 'model digest');
  assertEqual(modelBytes.length, verifiedRuntime.model.byteLength, 'model byte length');

  const chrome = findChrome();
  const product = browserProduct(chrome.version);
  if (product !== qualityReport.measurementProvenance?.browserProduct || chrome.version !== qualityReport.measurementProvenance?.browserVersion) {
    throw new Error(`FR-DATA-06 browser binary must exactly match FR-DATA-05 browser provenance: ${chrome.version}`);
  }
  if (process.platform !== qualityReport.measurementProvenance?.platform) {
    throw new Error(`FR-DATA-06 host platform must exactly match FR-DATA-05 provenance: ${process.platform}`);
  }

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (requestUrl.pathname === '/fr-data06.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end('<!doctype html><meta charset="utf-8"><title>FR-DATA-06</title>'); return;
      }
      if (requestUrl.pathname === '/vendor/vision_bundle.mjs') {
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        response.end(await readFile(bundlePath)); return;
      }
      if (requestUrl.pathname.startsWith('/vendor/wasm/')) {
        const requested = requestUrl.pathname.slice('/vendor/wasm/'.length);
        const target = resolve(wasmDir, requested);
        if (!target.startsWith(resolve(wasmDir) + sep)) throw new Error('FR-DATA-06 refused WASM path traversal.');
        response.writeHead(200, { 'content-type': mime(target), 'cache-control': 'no-store' });
        response.end(await readFile(target)); return;
      }
      if (requestUrl.pathname === '/assets/face_landmarker.task') {
        response.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
        response.end(modelBytes); return;
      }
      const asset = assetRecords.find((entry) => entry.route === requestUrl.pathname);
      if (!asset) { response.statusCode = 404; response.end('not found'); return; }
      response.writeHead(200, { 'content-type': mime(asset.target, asset.contentSignature), 'cache-control': 'no-store' });
      response.end(await readFile(asset.target));
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });

  let child = null;
  let cdp = null;
  const profileDir = join(scratch, 'chrome-profile');
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('FR-DATA-06 failed to resolve local server port.');
    const pageOrigin = `http://127.0.0.1:${address.port}`;
    const pageUrl = `${pageOrigin}/fr-data06.html`;
    child = spawn(chrome.path, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
      '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-sync', '--metrics-recording-only',
      '--no-first-run', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${profileDir}`, pageUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr?.on('data', (chunk) => process.stderr.write(`FR_DATA06_CHROME_STDERR ${chunk}`));

    const wsUrl = await waitForPageTarget(pageUrl);
    cdp = await connectCdp(wsUrl);
    const pageState = await waitForPageReady(cdp, pageUrl);
    const evaluation = await cdp.command('Runtime.evaluate', {
      expression: pageExpression(assetRecords), awaitPromise: true, returnByValue: true, timeout: 60000,
    });
    if (evaluation.exceptionDetails) throw new Error(`FR-DATA-06 browser evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`);
    const runtime = evaluation.result?.value;
    if (!runtime || runtime.deterministicSummaryReplay !== true || !Array.isArray(runtime.first) || !Array.isArray(runtime.second)) {
      throw new Error(`FR-DATA-06 deterministic summary replay failed: ${JSON.stringify(runtime)}`);
    }
    for (const entry of runtime.first) {
      if (entry.status !== 'observed') throw new Error(`FR-DATA-06 provider observation failure: ${JSON.stringify(entry)}`);
    }

    const providerProvenance = Object.freeze({
      protocol: 'chrome_devtools_protocol',
      providerRuntime: 'mediapipe_tasks_vision_face_landmarker',
      runtimePackageName: verifiedRuntime.runtimePackageName,
      runtimePackageVersion: verifiedRuntime.runtimePackageVersion,
      packageBundleDigest,
      wasmFiles: Object.freeze(wasmFiles),
      modelAssetRef: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
      modelDigest,
      modelByteLength: modelBytes.length,
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      sourceImagePrimitive: 'html_image_element_after_decode',
      rasterReconfirmationPrimitive: 'canvas_2d_get_image_data_sha256_before_provider_detect',
      browserProduct: product,
      browserVersion: chrome.version,
      platform: process.platform,
      runnerOS: process.env.RUNNER_OS ?? null,
      runnerArch: process.env.RUNNER_ARCH ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      githubSha: process.env.GITHUB_SHA ?? null,
      verificationTimestamp: new Date().toISOString(),
      pageUrl,
      pageOrigin,
      pageReadyState: pageState.readyState,
      deterministicSummaryReplay: true,
      rawProviderResponsePersisted: false,
      rawProviderCoordinatesPersisted: false,
    });

    const report = buildMentonDatasetProviderFaceCandidateObservationReportFRData06(
      manifest, intakeReport, dimensionReport, pixelReport, qualityReport, providerProvenance, runtime.first,
    );
    const reportPath = resolve(reportPathInput);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`FR_DATA_06_PROVIDER_FACE_CANDIDATES ${JSON.stringify(report)}`);
    return report;
  } finally {
    if (cdp?.ws) cdp.ws.close();
    await stopChrome(child);
    if (server.listening) { server.close(); await once(server, 'close').catch(() => []); }
    await rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  }
}

async function main() {
  const [manifestPath, assetRoot, pixelReportPath, qualityReportPath, reportPath] = process.argv.slice(2);
  if (!manifestPath || !assetRoot || !pixelReportPath || !qualityReportPath || !reportPath) {
    throw new Error('Usage: node scripts/face-reading-fr-data06-provider-face-candidates.mjs <manifest.json> <asset-root> <fr-data04-report.json> <fr-data05-report.json> <report.json>');
  }
  await runMentonDatasetProviderFaceCandidateObservationsFRData06(manifestPath, assetRoot, pixelReportPath, qualityReportPath, reportPath);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
