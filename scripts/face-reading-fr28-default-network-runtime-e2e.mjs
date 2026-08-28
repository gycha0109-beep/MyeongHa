import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  FR26_MEDIAPIPE_WASM_ROOT,
} from '../dist/packages/face-reading/src/mediapipe-face-landmarker-runtime-fr26.js';
import {
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
} from '../dist/packages/face-reading/src/mediapipe-real-runtime-evidence-fr27.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_VERSION = '0.10.35';
const FIXTURE_REPOSITORY = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.fixture.repository;
const FIXTURE_COMMIT = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.fixture.sourceCommit;
const FIXTURE_BLOB_SHA = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.fixture.sourceBlobSha;
const FIXTURE_URL = `https://raw.githubusercontent.com/${FIXTURE_REPOSITORY}/${FIXTURE_COMMIT}/${MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.fixture.sourcePath}`;
const EXPECTED_FIXTURE_DIGEST = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.fixture.independentByteDigest;
const EXPECTED_FIXTURE_BYTE_LENGTH = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.fixture.byteLength;
const EXPECTED_MODEL_DIGEST = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.model.independentByteDigest;
const EXPECTED_MODEL_BYTE_LENGTH = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.model.byteLength;
const EXPECTED_PACKAGE_BUNDLE_DIGEST = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.installedPackageAssets.packageBundleDigest;
const EXPECTED_WASM_DIGESTS = Object.freeze(Object.fromEntries(
  FR27_EXPECTED_INSTALLED_WASM_DIGESTS.map((entry) => [entry.file, entry.digest]),
));
const ALLOWED_EXTERNAL_URLS = new Set([
  ...Object.keys(EXPECTED_WASM_DIGESTS).map((name) => `${FR26_MEDIAPIPE_WASM_ROOT}/${name}`),
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
]);
const CDP_PORT = 9223;

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`FR-28 ${label} mismatch: expected ${expected}, received ${actual}`);
}

function assertExactRecord(actual, expected, label) {
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`FR-28 ${label} mismatch: expected ${JSON.stringify(expectedEntries)}, received ${JSON.stringify(actualEntries)}`);
  }
}

async function download(url, path) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`FR-28 download failed ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (path) await writeFile(path, bytes);
  return bytes;
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return { path: candidate, version: probe.stdout.trim() || probe.stderr.trim() };
  }
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const which = spawnSync('which', [name], { encoding: 'utf8' });
    const candidate = which.status === 0 ? which.stdout.trim() : '';
    if (!candidate) continue;
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return { path: candidate, version: probe.stdout.trim() || probe.stderr.trim() };
  }
  throw new Error('FR-28 requires an installed Chrome/Chromium binary; none was found.');
}

function mime(path) {
  switch (extname(path)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForPageTarget(pageUrl) {
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((entry) => entry.type === 'page' && entry.url === pageUrl);
        if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`FR-28 could not discover Chrome DevTools page target: ${lastError instanceof Error ? lastError.message : String(lastError ?? '')}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', () => rejectPromise(new Error('FR-28 CDP WebSocket connection failed.')), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  const consoleEvents = [];
  const exceptionEvents = [];
  const requests = [];
  const responses = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`CDP ${waiter.method} failed: ${JSON.stringify(message.error)}`));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const values = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
      consoleEvents.push(values);
      console.log(`FR28_BROWSER_CONSOLE ${values}`);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      exceptionEvents.push(detail);
      console.log(`FR28_BROWSER_EXCEPTION ${JSON.stringify(detail)}`);
    } else if (message.method === 'Network.requestWillBeSent') {
      requests.push({ requestId: message.params.requestId, url: message.params.request.url, method: message.params.request.method });
    } else if (message.method === 'Network.responseReceived') {
      responses.push({ requestId: message.params.requestId, url: message.params.response.url, status: message.params.response.status, mimeType: message.params.response.mimeType });
    }
  });
  function command(method, params = {}) {
    const id = nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await command('Runtime.enable');
  await command('Network.enable');
  return { ws, command, consoleEvents, exceptionEvents, requests, responses };
}

async function main() {
  const bundlePath = fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision'));
  const packageRoot = dirname(bundlePath);
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assertEqual(packageJson.version, PACKAGE_VERSION, 'package version');

  const installedBundleDigest = sha256(await readFile(bundlePath));
  assertEqual(installedBundleDigest, EXPECTED_PACKAGE_BUNDLE_DIGEST, 'installed package bundle digest');
  const wasmDir = join(packageRoot, 'wasm');
  const installedWasmDigests = {};
  for (const name of (await readdir(wasmDir)).sort()) {
    const path = join(wasmDir, name);
    if ((await stat(path)).isFile()) installedWasmDigests[name] = sha256(await readFile(path));
  }
  assertExactRecord(installedWasmDigests, EXPECTED_WASM_DIGESTS, 'installed WASM digest set');

  const remoteWasmDigests = {};
  for (const name of Object.keys(EXPECTED_WASM_DIGESTS).sort()) {
    remoteWasmDigests[name] = sha256(await download(`${FR26_MEDIAPIPE_WASM_ROOT}/${name}`));
  }
  assertExactRecord(remoteWasmDigests, EXPECTED_WASM_DIGESTS, 'jsDelivr WASM digest set');
  assertExactRecord(remoteWasmDigests, installedWasmDigests, 'jsDelivr-to-installed WASM byte equivalence');

  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-fr28-'));
  try {
    const fixturePath = join(scratch, 'face_model.png');
    const fixtureBytes = await download(FIXTURE_URL, fixturePath);
    const modelBytes = await download(FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL);
    const fixtureDigest = sha256(fixtureBytes);
    const modelDigest = sha256(modelBytes);
    assertEqual(fixtureDigest, EXPECTED_FIXTURE_DIGEST, 'fixture digest');
    assertEqual(fixtureBytes.length, EXPECTED_FIXTURE_BYTE_LENGTH, 'fixture byte length');
    assertEqual(modelDigest, EXPECTED_MODEL_DIGEST, 'default model URL digest');
    assertEqual(modelBytes.length, EXPECTED_MODEL_BYTE_LENGTH, 'default model URL byte length');

    const discovery = {
      schemaVersion: 'fr28-discovery-v1',
      packageVersion: PACKAGE_VERSION,
      defaultWasmRoot: FR26_MEDIAPIPE_WASM_ROOT,
      defaultModelUrl: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
      packageBundleDigest: installedBundleDigest,
      installedWasmDigests,
      remoteWasmDigests,
      wasmReferenceRootByteEquivalenceVerified: true,
      model: { digest: modelDigest, byteLength: modelBytes.length, referenceBytesVerified: true },
      fixture: { repository: FIXTURE_REPOSITORY, commit: FIXTURE_COMMIT, blobSha: FIXTURE_BLOB_SHA, digest: fixtureDigest, byteLength: fixtureBytes.length },
    };
    console.log(`FR28_DISCOVERY ${JSON.stringify(discovery)}`);

    const importMap = JSON.stringify({ imports: { '@mediapipe/tasks-vision': '/vendor/vision_bundle.mjs' } });
    const html = `<!doctype html><html><head><meta charset="utf-8"><script type="importmap">${importMap}</script><title>FR28</title></head><body><img id="fixture" src="/assets/face_model.png" alt="fr28 fixture"></body></html>`;
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        let path;
        if (url.pathname === '/fr28.html') path = null;
        else if (url.pathname === '/vendor/vision_bundle.mjs') path = bundlePath;
        else if (url.pathname === '/assets/face_model.png') path = fixturePath;
        else if (url.pathname.startsWith('/dist/')) path = join(ROOT, url.pathname.slice(1));
        else { res.writeHead(404); res.end('not found'); return; }
        if (path === null) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(html);
          return;
        }
        const safe = normalize(path);
        const allowed = [ROOT, packageRoot, scratch].some((prefix) => safe === prefix || safe.startsWith(prefix + '/'));
        if (!allowed) throw new Error(`refusing path outside allowed roots: ${safe}`);
        res.writeHead(200, { 'content-type': mime(safe), 'cache-control': 'no-store' });
        res.end(await readFile(safe));
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(error instanceof Error ? error.stack ?? error.message : String(error));
      }
    });
    await new Promise((resolvePromise, rejectPromise) => {
      server.once('error', rejectPromise);
      server.listen(0, '127.0.0.1', resolvePromise);
    });

    let child;
    let cdp;
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('FR-28 server did not expose an IPv4 port.');
      const pageUrl = `http://127.0.0.1:${address.port}/fr28.html`;
      const chrome = findChrome();
      console.log(`FR28_CHROME ${chrome.version}`);
      let chromeStderr = '';
      child = spawn(chrome.path, [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
        '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--no-first-run',
        `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', `--user-data-dir=${join(scratch, 'chrome-profile')}`, pageUrl,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { chromeStderr = (chromeStderr + chunk).slice(-20000); });

      const wsUrl = await waitForPageTarget(pageUrl);
      cdp = await connectCdp(wsUrl);
      const expression = `
(async () => {
  console.log('FR28_STAGE module-import-start');
  const { runMediaPipeEyePairResearchFR26 } = await import('/dist/packages/face-reading/src/mediapipe-face-landmarker-runtime-fr26.js');
  console.log('FR28_STAGE module-import-complete');
  const image = document.getElementById('fixture');
  await image.decode();
  console.log('FR28_STAGE image-decode-complete', image.naturalWidth, image.naturalHeight);
  const request = Object.freeze({
    schemaVersion: 'fr26-mediapipe-face-landmarker-request-v1',
    providerRunRef: 'fr28:default-network:official-sample',
    canonicalAssetDigest: ${JSON.stringify(fixtureDigest)},
    image,
  });
  console.log('FR28_STAGE fr26-default-first-start');
  const first = await runMediaPipeEyePairResearchFR26(request);
  console.log('FR28_STAGE fr26-default-first-complete');
  const second = await runMediaPipeEyePairResearchFR26(request);
  console.log('FR28_STAGE fr26-default-second-complete');
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  return {
    status: 'success', defaultFactoryInjected: false,
    deterministicReplay: JSON.stringify(first.eyePairArtifact) === JSON.stringify(second.eyePairArtifact),
    imageDimensions: [image.naturalWidth, image.naturalHeight],
    regionCount: first.eyePairArtifact.regions.length,
    boundaryVertexCounts: first.eyePairArtifact.regions.map((region) => region.boundary.length),
    sideAuthority: first.eyePairArtifact.sideAuthority,
    consumerSlotAssignment: first.eyePairArtifact.consumerSlotAssignment,
    productionNeutralObservationIssued: first.productionNeutralObservationIssued,
    productionProviderActivationAllowed: first.productionProviderActivationAllowed,
    anatomicalLateralityResolved: first.anatomicalLateralityResolved,
    traditionalSemanticAuthority: first.traditionalSemanticAuthority,
  };
})()`;
      const evaluationPromise = cdp.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 90000 });
      const timeoutPromise = new Promise((_, rejectPromise) => setTimeout(() => rejectPromise(new Error(`FR-28 CDP evaluation timeout. console=${JSON.stringify(cdp.consoleEvents)} exceptions=${JSON.stringify(cdp.exceptionEvents)} chrome=${chromeStderr}`)), 95000));
      const evaluation = await Promise.race([evaluationPromise, timeoutPromise]);
      if (evaluation.exceptionDetails) throw new Error(`FR-28 browser exception: ${JSON.stringify(evaluation.exceptionDetails)}`);
      const result = evaluation.result?.value;
      console.log(`FR28_RUNTIME ${JSON.stringify(result)}`);
      if (!result || result.status !== 'success' || result.defaultFactoryInjected !== false || result.deterministicReplay !== true) {
        throw new Error(`FR-28 default runtime result invalid: ${JSON.stringify(result)}`);
      }
      if (JSON.stringify(result.imageDimensions) !== '[640,640]' || result.regionCount !== 2 || JSON.stringify(result.boundaryVertexCounts) !== '[16,16]') {
        throw new Error(`FR-28 projected result shape mismatch: ${JSON.stringify(result)}`);
      }
      if (result.sideAuthority !== 'provider_label_only' || result.consumerSlotAssignment !== null || result.productionNeutralObservationIssued !== false || result.productionProviderActivationAllowed !== false || result.anatomicalLateralityResolved !== false || result.traditionalSemanticAuthority !== false) {
        throw new Error(`FR-28 authority boundary was promoted: ${JSON.stringify(result)}`);
      }

      const externalRequests = cdp.requests.filter((entry) => !entry.url.startsWith('http://127.0.0.1:')).map((entry) => ({ url: entry.url, method: entry.method }));
      const externalResponses = cdp.responses.filter((entry) => !entry.url.startsWith('http://127.0.0.1:')).map((entry) => ({ url: entry.url, status: entry.status, mimeType: entry.mimeType }));
      const unexpectedExternalRequests = externalRequests.filter((entry) => entry.method !== 'GET' || !ALLOWED_EXTERNAL_URLS.has(entry.url));
      console.log(`FR28_EXTERNAL_REQUESTS ${JSON.stringify(externalRequests)}`);
      console.log(`FR28_EXTERNAL_RESPONSES ${JSON.stringify(externalResponses)}`);
      if (unexpectedExternalRequests.length !== 0) {
        throw new Error(`FR-28 observed unexpected external requests: ${JSON.stringify(unexpectedExternalRequests)}`);
      }
      if (!externalRequests.some((entry) => entry.url.startsWith(`${FR26_MEDIAPIPE_WASM_ROOT}/`))) {
        throw new Error(`FR-28 default factory did not request the pinned WASM root: ${JSON.stringify(externalRequests)}`);
      }
      if (!externalRequests.some((entry) => entry.url === FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL)) {
        throw new Error(`FR-28 default factory did not request the pinned model URL: ${JSON.stringify(externalRequests)}`);
      }
      if (externalResponses.some((entry) => entry.status < 200 || entry.status >= 300)) {
        throw new Error(`FR-28 external runtime response was non-2xx: ${JSON.stringify(externalResponses)}`);
      }

      const artifact = {
        ...discovery,
        chrome: chrome.version,
        runtimeResult: result,
        externalRequests,
        externalResponses,
        unexpectedExternalRequests,
        networkObservationWindowMsAfterReplay: 1000,
        telemetryAbsenceClaimed: false,
      };
      const artifactPath = join(ROOT, 'artifacts', 'face-reading');
      await mkdir(artifactPath, { recursive: true });
      await writeFile(join(artifactPath, 'fr28-default-network-runtime-e2e.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    } finally {
      if (cdp) cdp.ws.close();
      if (child && child.exitCode === null) {
        const childExit = new Promise((resolvePromise) => child.once('exit', resolvePromise));
        child.kill('SIGKILL');
        await Promise.race([childExit, delay(5000)]);
      }
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
