import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_REPOSITORY = 'google-ai-edge/mediapipe-samples-web';
const FIXTURE_COMMIT = 'bbb8974ffd450650ad5a1e7c1656c9debb8e38bf';
const FIXTURE_BLOB_SHA = '7ec9d163603c98159d283b6ceb9086f9794d1dc9';
const FIXTURE_URL = `https://raw.githubusercontent.com/${FIXTURE_REPOSITORY}/${FIXTURE_COMMIT}/public/face_model.png`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const PACKAGE_VERSION = '0.10.35';
const EXPECTED_PACKAGE_BUNDLE_DIGEST = 'sha256:55d7ab624fbb70dcc5adc4ae6d7ea9cfcb569139d3dbfbf2b1deafcb966bc0fe';
const EXPECTED_WASM_DIGESTS = Object.freeze({
  'vision_wasm_internal.js': 'sha256:e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c',
  'vision_wasm_internal.wasm': 'sha256:6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc',
  'vision_wasm_module_internal.js': 'sha256:1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44',
  'vision_wasm_module_internal.wasm': 'sha256:617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756',
  'vision_wasm_nosimd_internal.js': 'sha256:438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296',
  'vision_wasm_nosimd_internal.wasm': 'sha256:8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31',
});
const EXPECTED_MODEL_DIGEST = 'sha256:64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const EXPECTED_MODEL_BYTE_LENGTH = 3758596;
const EXPECTED_FIXTURE_DIGEST = 'sha256:75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9';
const EXPECTED_FIXTURE_BYTE_LENGTH = 578267;
const EXPECTED_LANDMARK_KEYS = Object.freeze(['visibility', 'x', 'y', 'z']);
const CDP_PORT = 9222;

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`FR-27 ${label} mismatch: expected ${expected}, received ${actual}`);
  }
}

function assertExactRecord(actual, expected, label) {
  const actualEntries = Object.entries(actual).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expected).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`FR-27 ${label} mismatch: expected ${JSON.stringify(expectedEntries)}, received ${JSON.stringify(actualEntries)}`);
  }
}

async function download(url, path) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`download failed ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
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
    const candidate = which.status === 0 ? which.stdout.trim() : '';
    if (!candidate) continue;
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return { path: candidate, version: probe.stdout.trim() || probe.stderr.trim() };
  }
  throw new Error('FR-27 requires an installed Chrome/Chromium binary; none was found.');
}

function mime(path) {
  switch (extname(path)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.wasm': return 'application/wasm';
    case '.png': return 'image/png';
    case '.task': return 'application/octet-stream';
    default: return 'application/octet-stream';
  }
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null) return;
  const exitPromise = once(child, 'exit').catch(() => []);
  child.kill('SIGKILL');
  await Promise.race([exitPromise, delay(3000)]);
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
  throw new Error(`FR-27 could not discover Chrome DevTools page target: ${lastError instanceof Error ? lastError.message : String(lastError ?? '')}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', () => rejectPromise(new Error('FR-27 CDP WebSocket connection failed.')), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const consoleEvents = [];
  const exceptionEvents = [];

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
      console.log(`FR27_BROWSER_CONSOLE ${values}`);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      exceptionEvents.push(detail);
      console.log(`FR27_BROWSER_EXCEPTION ${JSON.stringify(detail)}`);
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
  return { ws, command, consoleEvents, exceptionEvents };
}

async function main() {
  const bundlePath = fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision'));
  const packageRoot = dirname(bundlePath);
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assertEqual(packageJson.version, PACKAGE_VERSION, 'package version');

  const wasmDir = join(packageRoot, 'wasm');
  const wasmNames = (await readdir(wasmDir)).sort();
  const wasmDigests = {};
  for (const name of wasmNames) {
    const path = join(wasmDir, name);
    if ((await stat(path)).isFile()) wasmDigests[name] = sha256(await readFile(path));
  }
  const bundleDigest = sha256(await readFile(bundlePath));
  assertEqual(bundleDigest, EXPECTED_PACKAGE_BUNDLE_DIGEST, 'installed package bundle digest');
  assertExactRecord(wasmDigests, EXPECTED_WASM_DIGESTS, 'installed WASM digest set');

  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-fr27-'));
  try {
    const fixturePath = join(scratch, 'face_model.png');
    const modelPath = join(scratch, 'face_landmarker.task');
    const fixtureBytes = await download(FIXTURE_URL, fixturePath);
    const modelBytes = await download(MODEL_URL, modelPath);
    const fixtureDigest = sha256(fixtureBytes);
    const modelDigest = sha256(modelBytes);

    assertEqual(fixtureDigest, EXPECTED_FIXTURE_DIGEST, 'fixture digest');
    assertEqual(fixtureBytes.length, EXPECTED_FIXTURE_BYTE_LENGTH, 'fixture byte length');
    assertEqual(modelDigest, EXPECTED_MODEL_DIGEST, 'model digest');
    assertEqual(modelBytes.length, EXPECTED_MODEL_BYTE_LENGTH, 'model byte length');

    const discovery = {
      schemaVersion: 'fr27-discovery-v1',
      packageVersion: PACKAGE_VERSION,
      packageBundle: {
        file: 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs',
        digest: bundleDigest,
      },
      wasmDigests,
      model: { url: MODEL_URL, digest: modelDigest, byteLength: modelBytes.length },
      fixture: {
        repository: FIXTURE_REPOSITORY,
        commit: FIXTURE_COMMIT,
        blobSha: FIXTURE_BLOB_SHA,
        url: FIXTURE_URL,
        digest: fixtureDigest,
        byteLength: fixtureBytes.length,
      },
    };
    console.log(`FR27_DISCOVERY ${JSON.stringify(discovery)}`);

    const html = '<!doctype html><html><head><meta charset="utf-8"><title>FR27</title></head><body><img id="fixture" src="/assets/face_model.png" alt="fr27 fixture"></body></html>';
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        let path;
        if (url.pathname === '/fr27.html') path = null;
        else if (url.pathname === '/vendor/vision_bundle.mjs') path = bundlePath;
        else if (url.pathname.startsWith('/vendor/wasm/')) path = join(wasmDir, url.pathname.slice('/vendor/wasm/'.length));
        else if (url.pathname === '/assets/face_model.png') path = fixturePath;
        else if (url.pathname === '/assets/face_landmarker.task') path = modelPath;
        else if (url.pathname.startsWith('/dist/')) path = join(ROOT, url.pathname.slice(1));
        else {
          res.writeHead(404);
          res.end('not found');
          return;
        }

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
      if (!address || typeof address === 'string') throw new Error('FR-27 server did not expose an IPv4 port.');
      const pageUrl = `http://127.0.0.1:${address.port}/fr27.html`;
      const chrome = findChrome();
      console.log(`FR27_CHROME ${chrome.version}`);

      let chromeStderr = '';
      child = spawn(chrome.path, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-extensions',
        '--no-first-run',
        `--remote-debugging-port=${CDP_PORT}`,
        '--remote-allow-origins=*',
        `--user-data-dir=${join(scratch, 'chrome-profile')}`,
        pageUrl,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        chromeStderr = (chromeStderr + chunk).slice(-20000);
      });

      const wsUrl = await waitForPageTarget(pageUrl);
      cdp = await connectCdp(wsUrl);
      const expression = `
(async () => {
  console.log('FR27_STAGE module-import-start');
  const [{ runMediaPipeEyePairResearchFR26 }, vision] = await Promise.all([
    import('/dist/packages/face-reading/src/mediapipe-face-landmarker-runtime-fr26.js'),
    import('/vendor/vision_bundle.mjs'),
  ]);
  console.log('FR27_STAGE module-import-complete');

  const image = document.getElementById('fixture');
  await image.decode();
  console.log('FR27_STAGE image-decode-complete', image.naturalWidth, image.naturalHeight);

  const observations = [];
  const factory = Object.freeze({
    async create() {
      console.log('FR27_STAGE fileset-start');
      const fileset = await vision.FilesetResolver.forVisionTasks(location.origin + '/vendor/wasm');
      console.log('FR27_STAGE fileset-complete');
      const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: location.origin + '/assets/face_landmarker.task' },
        runningMode: 'IMAGE',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      console.log('FR27_STAGE landmarker-created');
      return Object.freeze({
        detect(source) {
          console.log('FR27_STAGE detect-start');
          const result = landmarker.detect(source);
          console.log('FR27_STAGE detect-return', result.faceLandmarks.length);
          observations.push({
            faceCount: result.faceLandmarks.length,
            landmarkCounts: result.faceLandmarks.map((face) => face.length),
            landmarkKeySets: result.faceLandmarks.map((face) => [...new Set(face.flatMap((landmark) => Object.keys(landmark)))].sort()),
            blendshapeCount: result.faceBlendshapes.length,
            matrixCount: result.facialTransformationMatrixes.length,
          });
          return result;
        },
        close() {
          landmarker.close();
          console.log('FR27_STAGE landmarker-closed');
        },
      });
    },
  });

  const request = Object.freeze({
    schemaVersion: 'fr26-mediapipe-face-landmarker-request-v1',
    providerRunRef: 'fr27:official-sample:face-model',
    canonicalAssetDigest: ${JSON.stringify(fixtureDigest)},
    image,
  });

  console.log('FR27_STAGE fr26-first-start');
  const first = await runMediaPipeEyePairResearchFR26(request, factory);
  console.log('FR27_STAGE fr26-first-complete');
  const second = await runMediaPipeEyePairResearchFR26(request, factory);
  console.log('FR27_STAGE fr26-second-complete');

  return {
    status: 'success',
    realBrowserExecution: true,
    deterministicReplay: JSON.stringify(first.eyePairArtifact) === JSON.stringify(second.eyePairArtifact),
    imageDimensions: [image.naturalWidth, image.naturalHeight],
    observations,
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

      const evaluationPromise = cdp.command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        timeout: 60000,
      });
      let timeoutHandle;
      const timeoutPromise = new Promise((_, rejectPromise) => {
        timeoutHandle = setTimeout(() => rejectPromise(new Error(
          `FR-27 CDP evaluation timeout. console=${JSON.stringify(cdp.consoleEvents)} exceptions=${JSON.stringify(cdp.exceptionEvents)} chrome=${chromeStderr}`,
        )), 65000);
      });
      let evaluation;
      try {
        evaluation = await Promise.race([evaluationPromise, timeoutPromise]);
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      }
      if (evaluation.exceptionDetails) {
        throw new Error(`FR-27 browser exception: ${JSON.stringify(evaluation.exceptionDetails)}`);
      }

      const result = evaluation.result?.value;
      console.log(`FR27_RUNTIME ${JSON.stringify(result)}`);
      if (!result || result.status !== 'success') {
        throw new Error(`FR-27 browser runtime returned invalid result: ${JSON.stringify(result)}`);
      }
      if (result.realBrowserExecution !== true || result.deterministicReplay !== true) {
        throw new Error('FR-27 real execution or deterministic replay check failed.');
      }
      if (!Array.isArray(result.observations) || result.observations.length !== 2 || result.observations.some((entry) => entry.faceCount !== 1)) {
        throw new Error(`FR-27 expected exactly one real detected face in each replay: ${JSON.stringify(result.observations)}`);
      }
      if (result.observations.some((entry) => JSON.stringify(entry.landmarkCounts) !== '[478]' || entry.blendshapeCount !== 0 || entry.matrixCount !== 0)) {
        throw new Error(`FR-27 provider result shape mismatch: ${JSON.stringify(result.observations)}`);
      }
      if (result.observations.some((entry) => JSON.stringify(entry.landmarkKeySets) !== JSON.stringify([EXPECTED_LANDMARK_KEYS]))) {
        throw new Error(`FR-27 provider landmark field set mismatch: ${JSON.stringify(result.observations)}`);
      }
      if (result.regionCount !== 2 || JSON.stringify(result.boundaryVertexCounts) !== '[16,16]') {
        throw new Error(`FR-27 eye projection shape mismatch: ${JSON.stringify(result)}`);
      }
      if (
        result.sideAuthority !== 'provider_label_only' ||
        result.consumerSlotAssignment !== null ||
        result.productionNeutralObservationIssued !== false ||
        result.productionProviderActivationAllowed !== false ||
        result.anatomicalLateralityResolved !== false ||
        result.traditionalSemanticAuthority !== false
      ) {
        throw new Error(`FR-27 authority boundary was promoted: ${JSON.stringify(result)}`);
      }

      const artifact = { ...discovery, chrome: chrome.version, runtimeResult: result };
      const artifactPath = join(ROOT, 'artifacts', 'face-reading');
      await mkdir(artifactPath, { recursive: true });
      await writeFile(
        join(artifactPath, 'fr27-real-runtime-e2e.json'),
        `${JSON.stringify(artifact, null, 2)}\n`,
        'utf8',
      );
    } finally {
      if (cdp) cdp.ws.close();
      await stopChrome(child);
      await new Promise((resolvePromise) => server.close(resolvePromise));
    }
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
