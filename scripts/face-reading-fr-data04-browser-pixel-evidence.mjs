import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  buildMentonDatasetBrowserPixelEvidenceReportFRData04,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  validateMentonDatasetIntakeManifestFRData01,
} from '../dist/packages/face-reading/src/index.js';
import { verifyMentonDatasetAssetFilesFRData01 } from './face-reading-fr-data01-menton-dataset-intake.mjs';
import { inspectMentonDatasetImageDimensionsFRData02 } from './face-reading-fr-data02-image-dimensions.mjs';

const CDP_PORT = 9225;

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
  throw new Error('FR-DATA-04 requires an installed Chrome/Chromium binary; none was found.');
}

function browserProduct(version) {
  if (version.startsWith('Google Chrome')) return 'Google Chrome';
  if (version.startsWith('Chromium')) return 'Chromium';
  return version.split(/\s+/)[0] || 'unknown-chromium-product';
}

function assertConfined(root, target, captureRef) {
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`FR-DATA-04 capture ${captureRef} resolves outside the declared asset root.`);
  }
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
  throw new Error(`FR-DATA-04 could not discover Chrome DevTools page target: ${lastError instanceof Error ? lastError.message : String(lastError ?? '')}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', () => rejectPromise(new Error('FR-DATA-04 CDP WebSocket connection failed.')), { once: true });
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
      console.log(`FR_DATA04_BROWSER_CONSOLE ${values}`);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptionEvents.push(message.params.exceptionDetails);
      console.log(`FR_DATA04_BROWSER_EXCEPTION ${JSON.stringify(message.params.exceptionDetails)}`);
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

async function waitForPageReady(cdp, pageUrl) {
  const deadline = Date.now() + 15000;
  let lastState;
  while (Date.now() < deadline) {
    const evaluation = await cdp.command('Runtime.evaluate', {
      expression: '({ href: location.href, origin: location.origin, readyState: document.readyState })',
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) {
      lastState = { exceptionDetails: evaluation.exceptionDetails };
    } else {
      lastState = evaluation.result?.value;
      if (
        lastState?.href === pageUrl &&
        typeof lastState.origin === 'string' &&
        lastState.origin.startsWith('http://127.0.0.1:') &&
        (lastState.readyState === 'interactive' || lastState.readyState === 'complete')
      ) return lastState;
    }
    await delay(50);
  }
  throw new Error(`FR-DATA-04 page execution context was not ready: ${JSON.stringify(lastState)}`);
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null) return;
  const exitPromise = once(child, 'exit').catch(() => []);
  child.kill('SIGKILL');
  await Promise.race([exitPromise, delay(3000)]);
}

async function prepareAssetRecords(manifest, assetRootInput, verifiedAssets) {
  const assetRoot = await realpath(resolve(assetRootInput));
  const records = [];
  for (const [index, binding] of manifest.assets.entries()) {
    const target = await realpath(resolve(assetRoot, ...binding.relativeAssetPath.split('/')));
    assertConfined(assetRoot, target, binding.captureRef);
    const verified = verifiedAssets.find((entry) => entry.captureRef === binding.captureRef);
    if (!verified) throw new Error(`FR-DATA-04 missing FR-DATA-01 verified asset ${binding.captureRef}.`);
    records.push(Object.freeze({
      captureRef: binding.captureRef,
      relativeAssetPath: binding.relativeAssetPath,
      actualDigest: verified.actualDigest,
      contentSignature: verified.contentSignature,
      target,
      route: `/asset/${index}`,
    }));
  }
  return Object.freeze(records);
}

function pageExpression(assetRecords) {
  const browserAssets = assetRecords.map((entry) => ({
    captureRef: entry.captureRef,
    relativeAssetPath: entry.relativeAssetPath,
    route: entry.route,
  }));
  return `
(async () => {
  const assets = ${JSON.stringify(browserAssets)};
  const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
  function summarize(data) {
    const red = { min: 255, max: 0, sum: 0 };
    const green = { min: 255, max: 0, sum: 0 };
    const blue = { min: 255, max: 0, sum: 0 };
    const alpha = {
      min: 255, max: 0, sum: 0,
      transparentPixelCount: 0, partialAlphaPixelCount: 0, opaquePixelCount: 0
    };
    for (let offset = 0; offset < data.length; offset += 4) {
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      red.min = Math.min(red.min, r); red.max = Math.max(red.max, r); red.sum += r;
      green.min = Math.min(green.min, g); green.max = Math.max(green.max, g); green.sum += g;
      blue.min = Math.min(blue.min, b); blue.max = Math.max(blue.max, b); blue.sum += b;
      alpha.min = Math.min(alpha.min, a); alpha.max = Math.max(alpha.max, a); alpha.sum += a;
      if (a === 0) alpha.transparentPixelCount += 1;
      else if (a === 255) alpha.opaquePixelCount += 1;
      else alpha.partialAlphaPixelCount += 1;
    }
    return { red, green, blue, alpha };
  }
  async function inspect(entry, replay) {
    const image = new Image();
    image.decoding = 'sync';
    const event = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 10000);
      image.addEventListener('load', () => { clearTimeout(timeout); resolve('load'); }, { once: true });
      image.addEventListener('error', () => { clearTimeout(timeout); resolve('error'); }, { once: true });
      image.src = location.origin + entry.route + '?replay=' + replay;
    });
    if (event !== 'load') {
      return {
        captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
        decodeStatus: 'load_error', loadEventObserved: false, decodePromiseResolved: false,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        decodeErrorCode: event === 'timeout' ? 'image_load_timeout' : 'image_error_event',
        rasterStatus: 'draw_error', canvasDrawSucceeded: false, imageDataReadbackSucceeded: false,
        rasterWidth: 0, rasterHeight: 0, pixelCount: 0, rgbaByteLength: 0,
        rasterSha256: null, red: null, green: null, blue: null, alpha: null,
        rasterErrorCode: 'decode_prerequisite_failed'
      };
    }
    try {
      await Promise.race([
        image.decode(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('image_decode_timeout')), 10000))
      ]);
    } catch (error) {
      return {
        captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
        decodeStatus: 'decode_error', loadEventObserved: true, decodePromiseResolved: false,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        decodeErrorCode: error instanceof Error ? error.message : String(error),
        rasterStatus: 'draw_error', canvasDrawSucceeded: false, imageDataReadbackSucceeded: false,
        rasterWidth: 0, rasterHeight: 0, pixelCount: 0, rgbaByteLength: 0,
        rasterSha256: null, red: null, green: null, blue: null, alpha: null,
        rasterErrorCode: 'decode_prerequisite_failed'
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return {
        captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
        decodeStatus: 'decoded', loadEventObserved: true, decodePromiseResolved: true,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, decodeErrorCode: null,
        rasterStatus: 'draw_error', canvasDrawSucceeded: false, imageDataReadbackSucceeded: false,
        rasterWidth: canvas.width, rasterHeight: canvas.height, pixelCount: 0, rgbaByteLength: 0,
        rasterSha256: null, red: null, green: null, blue: null, alpha: null,
        rasterErrorCode: 'canvas_2d_context_unavailable'
      };
    }
    try {
      context.drawImage(image, 0, 0);
    } catch (error) {
      return {
        captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
        decodeStatus: 'decoded', loadEventObserved: true, decodePromiseResolved: true,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, decodeErrorCode: null,
        rasterStatus: 'draw_error', canvasDrawSucceeded: false, imageDataReadbackSucceeded: false,
        rasterWidth: canvas.width, rasterHeight: canvas.height, pixelCount: 0, rgbaByteLength: 0,
        rasterSha256: null, red: null, green: null, blue: null, alpha: null,
        rasterErrorCode: error instanceof Error ? error.message : String(error)
      };
    }

    let imageData;
    try {
      imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch (error) {
      return {
        captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
        decodeStatus: 'decoded', loadEventObserved: true, decodePromiseResolved: true,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, decodeErrorCode: null,
        rasterStatus: 'readback_error', canvasDrawSucceeded: true, imageDataReadbackSucceeded: false,
        rasterWidth: canvas.width, rasterHeight: canvas.height, pixelCount: 0, rgbaByteLength: 0,
        rasterSha256: null, red: null, green: null, blue: null, alpha: null,
        rasterErrorCode: error instanceof Error ? error.message : String(error)
      };
    }

    const copied = new Uint8Array(imageData.data);
    let digest;
    try {
      digest = await crypto.subtle.digest('SHA-256', copied);
    } catch (error) {
      return {
        captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
        decodeStatus: 'decoded', loadEventObserved: true, decodePromiseResolved: true,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, decodeErrorCode: null,
        rasterStatus: 'digest_error', canvasDrawSucceeded: true, imageDataReadbackSucceeded: true,
        rasterWidth: canvas.width, rasterHeight: canvas.height,
        pixelCount: canvas.width * canvas.height, rgbaByteLength: imageData.data.length,
        rasterSha256: null, red: null, green: null, blue: null, alpha: null,
        rasterErrorCode: error instanceof Error ? error.message : String(error)
      };
    }
    const summaries = summarize(imageData.data);
    return {
      captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
      decodeStatus: 'decoded', loadEventObserved: true, decodePromiseResolved: true,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, decodeErrorCode: null,
      rasterStatus: 'rasterized', canvasDrawSucceeded: true, imageDataReadbackSucceeded: true,
      rasterWidth: canvas.width, rasterHeight: canvas.height,
      pixelCount: canvas.width * canvas.height, rgbaByteLength: imageData.data.length,
      rasterSha256: 'sha256:' + hex(digest),
      red: summaries.red, green: summaries.green, blue: summaries.blue, alpha: summaries.alpha,
      rasterErrorCode: null
    };
  }
  async function run(replay) {
    const results = [];
    for (const entry of assets) results.push(await inspect(entry, replay));
    return results;
  }
  const first = await run(1);
  const second = await run(2);
  return {
    status: 'complete',
    deterministicReplay: JSON.stringify(first) === JSON.stringify(second),
    first,
    second
  };
})()`;
}

export async function runMentonDatasetBrowserPixelEvidenceVerificationFRData04(
  manifestPathInput,
  assetRootInput,
  reportPathInput = null,
) {
  const manifest = JSON.parse(await readFile(resolve(manifestPathInput), 'utf8'));
  validateMentonDatasetIntakeManifestFRData01(manifest);

  const verifiedAssets = await verifyMentonDatasetAssetFilesFRData01(manifest, assetRootInput);
  const intakeReport = buildMentonDatasetIntakeReportFRData01(manifest, verifiedAssets);
  const dimensionEvidence = await inspectMentonDatasetImageDimensionsFRData02(manifest, assetRootInput);
  const dimensionReport = buildMentonDatasetImageDimensionReportFRData02(manifest, dimensionEvidence);
  const assetRecords = await prepareAssetRecords(manifest, assetRootInput, verifiedAssets);

  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-fr-data04-'));
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>FR-DATA-04</title></head><body>browser pixel evidence verifier</body></html>';
  const routeMap = new Map(assetRecords.map((entry) => [entry.route, entry]));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/fr-data04.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }
      const asset = routeMap.get(url.pathname);
      if (!asset) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': asset.contentSignature, 'cache-control': 'no-store' });
      res.end(await readFile(asset.target));
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
    if (!address || typeof address === 'string') throw new Error('FR-DATA-04 server did not expose an IPv4 port.');
    const pageUrl = `http://127.0.0.1:${address.port}/fr-data04.html`;
    const chrome = findChrome();
    console.log(`FR_DATA04_CHROME ${chrome.version}`);
    let chromeStderr = '';
    child = spawn(chrome.path, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
      '--disable-extensions', '--no-first-run', `--remote-debugging-port=${CDP_PORT}`,
      '--remote-allow-origins=*', `--user-data-dir=${join(scratch, 'chrome-profile')}`, pageUrl,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { chromeStderr = (chromeStderr + chunk).slice(-20000); });

    const wsUrl = await waitForPageTarget(pageUrl);
    cdp = await connectCdp(wsUrl);
    const pageState = await waitForPageReady(cdp, pageUrl);
    console.log(`FR_DATA04_PAGE_READY ${JSON.stringify(pageState)}`);

    const evaluationPromise = cdp.command('Runtime.evaluate', {
      expression: pageExpression(assetRecords),
      awaitPromise: true,
      returnByValue: true,
      timeout: 60000,
    });
    let timeoutHandle;
    const timeoutPromise = new Promise((_, rejectPromise) => {
      timeoutHandle = setTimeout(() => rejectPromise(new Error(
        `FR-DATA-04 CDP evaluation timeout. console=${JSON.stringify(cdp.consoleEvents)} exceptions=${JSON.stringify(cdp.exceptionEvents)} chrome=${chromeStderr}`,
      )), 65000);
    });
    let evaluation;
    try {
      evaluation = await Promise.race([evaluationPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
    if (evaluation.exceptionDetails) throw new Error(`FR-DATA-04 browser exception: ${JSON.stringify(evaluation.exceptionDetails)}`);
    const runtimeResult = evaluation.result?.value;
    console.log(`FR_DATA04_RUNTIME ${JSON.stringify(runtimeResult)}`);
    if (!runtimeResult || runtimeResult.status !== 'complete' || runtimeResult.deterministicReplay !== true || !Array.isArray(runtimeResult.first)) {
      throw new Error(`FR-DATA-04 runtime result shape/determinism failure: ${JSON.stringify(runtimeResult)}`);
    }

    const digestByCapture = new Map(assetRecords.map((entry) => [entry.captureRef, entry.actualDigest]));
    const decodeEvidence = runtimeResult.first.map((entry) => Object.freeze({
      captureRef: entry.captureRef,
      relativeAssetPath: entry.relativeAssetPath,
      actualDigest: digestByCapture.get(entry.captureRef) ?? '',
      status: entry.decodeStatus,
      loadEventObserved: entry.loadEventObserved,
      decodePromiseResolved: entry.decodePromiseResolved,
      naturalWidth: entry.naturalWidth,
      naturalHeight: entry.naturalHeight,
      errorCode: entry.decodeErrorCode ?? null,
    }));

    const verificationTimestamp = new Date().toISOString();
    const decoderProvenance = Object.freeze({
      protocol: 'chrome_devtools_protocol',
      decodePrimitive: 'html_image_element_load_plus_decode',
      browserProduct: browserProduct(chrome.version),
      browserVersion: chrome.version,
      platform: process.platform,
      runnerOS: process.env.RUNNER_OS ?? null,
      runnerArch: process.env.RUNNER_ARCH ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      githubSha: process.env.GITHUB_SHA ?? null,
      verificationTimestamp,
      pageUrl,
      pageOrigin: pageState.origin,
      pageReadyState: pageState.readyState,
      deterministicReplay: true,
    });
    const decodeReport = buildMentonDatasetBrowserImageDecodeReportFRData03(
      manifest,
      intakeReport,
      dimensionReport,
      decoderProvenance,
      decodeEvidence,
    );

    const rasterEvidence = runtimeResult.first.map((entry) => Object.freeze({
      captureRef: entry.captureRef,
      relativeAssetPath: entry.relativeAssetPath,
      actualDigest: digestByCapture.get(entry.captureRef) ?? '',
      status: entry.rasterStatus,
      canvasDrawSucceeded: entry.canvasDrawSucceeded,
      imageDataReadbackSucceeded: entry.imageDataReadbackSucceeded,
      rasterWidth: entry.rasterWidth,
      rasterHeight: entry.rasterHeight,
      pixelCount: entry.pixelCount,
      rgbaByteLength: entry.rgbaByteLength,
      rasterSha256: entry.rasterSha256,
      red: entry.red,
      green: entry.green,
      blue: entry.blue,
      alpha: entry.alpha,
      errorCode: entry.rasterErrorCode ?? null,
    }));
    const rasterProvenance = Object.freeze({
      protocol: 'chrome_devtools_protocol',
      rasterPrimitive: 'canvas_2d_draw_image_get_image_data',
      browserProduct: decoderProvenance.browserProduct,
      browserVersion: decoderProvenance.browserVersion,
      platform: decoderProvenance.platform,
      runnerOS: decoderProvenance.runnerOS,
      runnerArch: decoderProvenance.runnerArch,
      githubRunId: decoderProvenance.githubRunId,
      githubRunAttempt: decoderProvenance.githubRunAttempt,
      githubSha: decoderProvenance.githubSha,
      verificationTimestamp: decoderProvenance.verificationTimestamp,
      pageUrl: decoderProvenance.pageUrl,
      pageOrigin: decoderProvenance.pageOrigin,
      pageReadyState: decoderProvenance.pageReadyState,
      deterministicReplay: true,
    });
    const report = buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      manifest,
      intakeReport,
      dimensionReport,
      decodeReport,
      rasterProvenance,
      rasterEvidence,
    );

    if (reportPathInput) {
      const reportPath = resolve(reportPathInput);
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    return report;
  } finally {
    try { cdp?.ws.close(); } catch {}
    await stopChrome(child);
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(scratch, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [, , manifestPath, assetRoot, reportPath] = process.argv;
  if (!manifestPath || !assetRoot) {
    console.error('Usage: node scripts/face-reading-fr-data04-browser-pixel-evidence.mjs <manifest.json> <asset-root> [report.json]');
    process.exitCode = 2;
  } else {
    try {
      const report = await runMentonDatasetBrowserPixelEvidenceVerificationFRData04(manifestPath, assetRoot, reportPath ?? null);
      console.log(`FR_DATA04_REPORT ${JSON.stringify(report)}`);
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
