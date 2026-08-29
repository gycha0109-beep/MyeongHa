import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  validateMentonDatasetIntakeManifestFRData01,
} from '../dist/packages/face-reading/src/index.js';
import { verifyMentonDatasetAssetFilesFRData01 } from './face-reading-fr-data01-menton-dataset-intake.mjs';
import { inspectMentonDatasetImageDimensionsFRData02 } from './face-reading-fr-data02-image-dimensions.mjs';

const CDP_PORT = 9224;

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
  throw new Error('FR-DATA-03 requires an installed Chrome/Chromium binary; none was found.');
}

function browserProduct(version) {
  if (version.startsWith('Google Chrome')) return 'Google Chrome';
  if (version.startsWith('Chromium')) return 'Chromium';
  return version.split(/\s+/)[0] || 'unknown-chromium-product';
}

function assertConfined(root, target, captureRef) {
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`FR-DATA-03 capture ${captureRef} resolves outside the declared asset root.`);
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
  throw new Error(`FR-DATA-03 could not discover Chrome DevTools page target: ${lastError instanceof Error ? lastError.message : String(lastError ?? '')}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', () => rejectPromise(new Error('FR-DATA-03 CDP WebSocket connection failed.')), { once: true });
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
      console.log(`FR_DATA03_BROWSER_CONSOLE ${values}`);
    } else if (message.method === 'Runtime.exceptionThrown') {
      exceptionEvents.push(message.params.exceptionDetails);
      console.log(`FR_DATA03_BROWSER_EXCEPTION ${JSON.stringify(message.params.exceptionDetails)}`);
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
  throw new Error(`FR-DATA-03 page execution context was not ready: ${JSON.stringify(lastState)}`);
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
    if (!verified) throw new Error(`FR-DATA-03 missing FR-DATA-01 verified asset ${binding.captureRef}.`);
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
        status: 'load_error', loadEventObserved: false, decodePromiseResolved: false,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        errorCode: event === 'timeout' ? 'image_load_timeout' : 'image_error_event'
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
        status: 'decode_error', loadEventObserved: true, decodePromiseResolved: false,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        errorCode: error instanceof Error ? error.message : String(error)
      };
    }
    return {
      captureRef: entry.captureRef, relativeAssetPath: entry.relativeAssetPath,
      status: 'decoded', loadEventObserved: true, decodePromiseResolved: true,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, errorCode: null
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

export async function runMentonDatasetBrowserImageDecodeVerificationFRData03(
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

  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-fr-data03-'));
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>FR-DATA-03</title></head><body>browser decode verifier</body></html>';
  const routeMap = new Map(assetRecords.map((entry) => [entry.route, entry]));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/fr-data03.html') {
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
    if (!address || typeof address === 'string') throw new Error('FR-DATA-03 server did not expose an IPv4 port.');
    const pageUrl = `http://127.0.0.1:${address.port}/fr-data03.html`;
    const chrome = findChrome();
    console.log(`FR_DATA03_CHROME ${chrome.version}`);
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
    console.log(`FR_DATA03_PAGE_READY ${JSON.stringify(pageState)}`);

    const evaluationPromise = cdp.command('Runtime.evaluate', {
      expression: pageExpression(assetRecords),
      awaitPromise: true,
      returnByValue: true,
      timeout: 60000,
    });
    let timeoutHandle;
    const timeoutPromise = new Promise((_, rejectPromise) => {
      timeoutHandle = setTimeout(() => rejectPromise(new Error(
        `FR-DATA-03 CDP evaluation timeout. console=${JSON.stringify(cdp.consoleEvents)} exceptions=${JSON.stringify(cdp.exceptionEvents)} chrome=${chromeStderr}`,
      )), 65000);
    });
    let evaluation;
    try {
      evaluation = await Promise.race([evaluationPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }
    if (evaluation.exceptionDetails) throw new Error(`FR-DATA-03 browser exception: ${JSON.stringify(evaluation.exceptionDetails)}`);
    const runtimeResult = evaluation.result?.value;
    console.log(`FR_DATA03_RUNTIME ${JSON.stringify(runtimeResult)}`);
    if (!runtimeResult || runtimeResult.status !== 'complete' || runtimeResult.deterministicReplay !== true || !Array.isArray(runtimeResult.first)) {
      throw new Error(`FR-DATA-03 runtime result shape/determinism failure: ${JSON.stringify(runtimeResult)}`);
    }

    const digestByCapture = new Map(assetRecords.map((entry) => [entry.captureRef, entry.actualDigest]));
    const evidence = runtimeResult.first.map((entry) => Object.freeze({
      captureRef: entry.captureRef,
      relativeAssetPath: entry.relativeAssetPath,
      actualDigest: digestByCapture.get(entry.captureRef) ?? '',
      status: entry.status,
      loadEventObserved: entry.loadEventObserved,
      decodePromiseResolved: entry.decodePromiseResolved,
      naturalWidth: entry.naturalWidth,
      naturalHeight: entry.naturalHeight,
      errorCode: entry.errorCode ?? null,
    }));
    const provenance = Object.freeze({
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
      verificationTimestamp: new Date().toISOString(),
      pageUrl,
      pageOrigin: pageState.origin,
      pageReadyState: pageState.readyState,
      deterministicReplay: true,
    });
    const report = buildMentonDatasetBrowserImageDecodeReportFRData03(
      manifest,
      intakeReport,
      dimensionReport,
      provenance,
      evidence,
    );
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (reportPathInput !== null) {
      const reportPath = resolve(reportPathInput);
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, serialized, 'utf8');
    }
    console.log(`FR_DATA_03_BROWSER_DECODE ${JSON.stringify(report)}`);
    return report;
  } finally {
    if (cdp) cdp.ws.close();
    await stopChrome(child);
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function main() {
  const [manifestPath, assetRoot, reportPath] = process.argv.slice(2);
  if (!manifestPath || !assetRoot) {
    throw new Error('Usage: node scripts/face-reading-fr-data03-browser-image-decode.mjs <manifest.json> <asset-root> [report.json]');
  }
  await runMentonDatasetBrowserImageDecodeVerificationFRData03(manifestPath, assetRoot, reportPath ?? null);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
