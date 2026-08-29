import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
const EXPECTED_MODEL_DIGEST = 'sha256:64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const EXPECTED_MODEL_BYTE_LENGTH = 3758596;
const EXPECTED_FIXTURE_DIGEST = 'sha256:75171e877e92b7a126cca2e7a388fc430225e07e9cd2e9e801eaa67ea6d7f4d9';
const EXPECTED_FIXTURE_BYTE_LENGTH = 578267;

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`FR-45 ${label} mismatch: expected ${expected}, received ${actual}`);
}

async function download(url, path) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`FR-45 download failed ${response.status} ${url}`);
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
  throw new Error('FR-45 requires an installed Chrome/Chromium binary; none was found.');
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

function decodeHtmlText(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

async function runChromeDump(chrome, pageUrl, scratch) {
  const child = spawn(chrome.path, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--disable-extensions', '--no-first-run', `--user-data-dir=${join(scratch, 'chrome-profile')}`,
    '--dump-dom', pageUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-20000); });

  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`FR-45 Chrome dump timeout: ${stderr}`));
    }, 70000);
  });
  const exited = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
  let result;
  try {
    result = await Promise.race([exited, timeout]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
  if (result.code !== 0) throw new Error(`FR-45 Chrome exited code=${result.code} signal=${result.signal}: ${stderr}`);
  return { stdout, stderr };
}

async function main() {
  const bundlePath = fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision'));
  const packageRoot = dirname(bundlePath);
  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assertEqual(packageJson.version, PACKAGE_VERSION, 'package version');
  assertEqual(sha256(await readFile(bundlePath)), EXPECTED_PACKAGE_BUNDLE_DIGEST, 'installed package bundle digest');
  const wasmDir = join(packageRoot, 'wasm');

  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-fr45-'));
  let server;
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

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>FR45</title></head><body>
<img id="fixture" src="/assets/face_model.png" alt="fr45 fixture">
<pre id="result">FR45_PENDING</pre>
<script type="module">
const target = document.getElementById('result');
try {
  const [vision, fr45] = await Promise.all([
    import('/vendor/vision_bundle.mjs'),
    import('/dist/packages/face-reading/src/mediapipe-face-oval-inferior-extremum-fr45.js'),
  ]);
  const image = document.getElementById('fixture');
  await image.decode();
  const fileset = await vision.FilesetResolver.forVisionTasks(location.origin + '/vendor/wasm');
  const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: location.origin + '/assets/face_landmarker.task' },
    runningMode: 'IMAGE', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
  });
  try {
    const first = landmarker.detect(image);
    const second = landmarker.detect(image);
    if (first.faceLandmarks.length !== 1 || second.faceLandmarks.length !== 1) {
      target.textContent = 'FR45_RESULT_START' + JSON.stringify({ status: 'invalid_face_count', first: first.faceLandmarks.length, second: second.faceLandmarks.length }) + 'FR45_RESULT_END';
    } else {
      const firstProbe = fr45.deriveMediaPipeFaceOvalImageInferiorExtremumFR45(vision.FaceLandmarker, first.faceLandmarks[0]);
      const secondProbe = fr45.deriveMediaPipeFaceOvalImageInferiorExtremumFR45(vision.FaceLandmarker, second.faceLandmarks[0]);
      const topology = fr45.inspectMediaPipeFaceOvalTopologyFR45(vision.FaceLandmarker);
      target.textContent = 'FR45_RESULT_START' + JSON.stringify({
        status: 'success', faceCount: 1, landmarkCount: first.faceLandmarks[0].length,
        deterministicReplay: JSON.stringify(firstProbe) === JSON.stringify(secondProbe),
        topology, firstProbe, secondProbe,
      }) + 'FR45_RESULT_END';
    }
  } finally {
    landmarker.close();
  }
} catch (error) {
  target.textContent = 'FR45_RESULT_START' + JSON.stringify({ status: 'error', message: String(error?.stack ?? error) }) + 'FR45_RESULT_END';
}
</script></body></html>`;

    server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        let path;
        if (url.pathname === '/fr45.html') path = null;
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
        if (!allowed) throw new Error(`FR-45 refusing path outside allowed roots: ${safe}`);
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
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('FR-45 server did not expose an IPv4 port.');
    const pageUrl = `http://127.0.0.1:${address.port}/fr45.html`;
    const chrome = findChrome();
    console.log(`FR45_CHROME ${chrome.version}`);
    const dump = await runChromeDump(chrome, pageUrl, scratch);
    const preMatch = dump.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    if (!preMatch) throw new Error(`FR-45 result element missing. stderr=${dump.stderr} dom=${dump.stdout.slice(-12000)}`);
    const preText = decodeHtmlText(preMatch[1]);
    if (preText === 'FR45_PENDING') throw new Error(`FR-45 browser dumped before module probe completed. stderr=${dump.stderr}`);
    const match = preText.match(/^FR45_RESULT_START([\s\S]*?)FR45_RESULT_END$/);
    if (!match) throw new Error(`FR-45 result marker missing inside result element: ${preText.slice(0, 1000)}`);
    const result = JSON.parse(match[1]);
    console.log(`FR45_RUNTIME ${JSON.stringify(result)}`);
    if (!result || result.status !== 'success' || result.faceCount !== 1 || result.landmarkCount !== 478 || result.deterministicReplay !== true) {
      throw new Error(`FR-45 runtime result shape/determinism failure: ${JSON.stringify(result)}`);
    }
    if (!result.topology || result.topology.topologyClass !== 'simple_cycle' || result.topology.edgeCount !== 36 ||
        result.topology.vertexCount !== 36 || result.topology.sourceRuntimeEdgeSequenceMatch !== true ||
        result.topology.providerIndexSemanticAuthority !== false) {
      throw new Error(`FR-45 runtime topology drift/authority promotion: ${JSON.stringify(result.topology)}`);
    }
    const probe = result.firstProbe;
    if (!probe || probe.state !== 'unique_image_inferior_extremum' || !Number.isInteger(probe.selectedProviderLandmarkIndex) ||
        !probe.selectedPoint || !Number.isFinite(probe.selectedPoint.x) || !Number.isFinite(probe.selectedPoint.y) ||
        probe.tiedProviderLandmarkIndices?.length !== 1 || probe.providerIndexSemanticAuthority !== false ||
        probe.chinInferiorContourBindingAuthorized !== false || probe.traditionalDigeEquivalenceAuthorized !== false ||
        probe.fr36VerticalReferencePromoted !== false || probe.productionGeometryAuthorized !== false) {
      throw new Error(`FR-45 runtime extremum signal/authority drift: ${JSON.stringify(probe)}`);
    }

    const artifact = {
      schemaVersion: 'fr45-real-runtime-evidence-v1',
      packageName: '@mediapipe/tasks-vision',
      packageVersion: PACKAGE_VERSION,
      packageBundleDigest: EXPECTED_PACKAGE_BUNDLE_DIGEST,
      model: { url: MODEL_URL, digest: modelDigest, byteLength: modelBytes.length },
      fixture: { repository: FIXTURE_REPOSITORY, commit: FIXTURE_COMMIT, blobSha: FIXTURE_BLOB_SHA, url: FIXTURE_URL, digest: fixtureDigest, byteLength: fixtureBytes.length },
      chrome: chrome.version,
      runtimeResult: result,
      authorityBoundary: {
        observedProviderLandmarkIndexIsEvidenceOnly: true,
        providerIndexSemanticAuthority: false,
        chinInferiorContourBindingAuthorized: false,
        traditionalDigeEquivalenceAuthorized: false,
        fr36VerticalReferencePromoted: false,
        productionGeometryAuthorized: false,
      },
    };
    const artifactPath = join(ROOT, 'artifacts', 'face-reading', 'fr45-face-oval-inferior-extremum-probe.json');
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    console.log(`FR45_ARTIFACT ${artifactPath}`);
  } finally {
    if (server) await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    await rm(scratch, { recursive: true, force: true });
  }
}

await main();
