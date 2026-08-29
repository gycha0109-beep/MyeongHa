import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  buildMentonDatasetCaptureQualityRawObservationReportFRData05,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  validateMentonDatasetIntakeManifestFRData01,
} from '../dist/packages/face-reading/src/index.js';
import { verifyMentonDatasetAssetFilesFRData01 } from './face-reading-fr-data01-menton-dataset-intake.mjs';
import { inspectMentonDatasetImageDimensionsFRData02 } from './face-reading-fr-data02-image-dimensions.mjs';

const CDP_PORT = 9226;

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
  throw new Error('FR-DATA-05 requires an installed Chrome/Chromium binary; none was found.');
}

function browserProduct(version) {
  if (version.startsWith('Google Chrome')) return 'Google Chrome';
  if (version.startsWith('Chromium')) return 'Chromium';
  throw new Error(`FR-DATA-05 unsupported browser product string: ${version}`);
}

function assertConfined(root, target, captureRef) {
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`FR-DATA-05 capture ${captureRef} resolves outside the declared asset root.`);
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
  throw new Error(`FR-DATA-05 could not discover Chrome DevTools page target: ${lastError instanceof Error ? lastError.message : String(lastError ?? '')}`);
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolvePromise, rejectPromise) => {
    ws.addEventListener('open', resolvePromise, { once: true });
    ws.addEventListener('error', () => rejectPromise(new Error('FR-DATA-05 CDP WebSocket connection failed.')), { once: true });
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
  function command(method, params = {}) {
    const id = nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await command('Runtime.enable');
  return { ws, command };
}

async function waitForPageReady(cdp, pageUrl) {
  const deadline = Date.now() + 15000;
  let lastState;
  while (Date.now() < deadline) {
    const evaluation = await cdp.command('Runtime.evaluate', {
      expression: '({ href: location.href, origin: location.origin, readyState: document.readyState, platform: navigator.platform })',
      returnByValue: true,
    });
    if (!evaluation.exceptionDetails) {
      lastState = evaluation.result?.value;
      if (
        lastState?.href === pageUrl &&
        typeof lastState.origin === 'string' &&
        lastState.origin.startsWith('http://127.0.0.1:') &&
        (lastState.readyState === 'interactive' || lastState.readyState === 'complete')
      ) return lastState;
    } else {
      lastState = { exceptionDetails: evaluation.exceptionDetails };
    }
    await delay(50);
  }
  throw new Error(`FR-DATA-05 page execution context was not ready: ${JSON.stringify(lastState)}`);
}

async function stopChrome(child) {
  if (!child || child.exitCode !== null) return;
  const exitPromise = once(child, 'exit').catch(() => []);
  child.kill('SIGKILL');
  await Promise.race([exitPromise, delay(3000)]);
}

async function prepareAssetRecords(manifest, assetRootInput, verifiedAssets, pixelReport) {
  const assetRoot = await realpath(resolve(assetRootInput));
  const records = [];
  for (const [index, binding] of manifest.assets.entries()) {
    const target = await realpath(resolve(assetRoot, ...binding.relativeAssetPath.split('/')));
    assertConfined(assetRoot, target, binding.captureRef);
    const verified = verifiedAssets.find((entry) => entry.captureRef === binding.captureRef);
    if (!verified) throw new Error(`FR-DATA-05 missing FR-DATA-01 verified asset ${binding.captureRef}.`);
    const pixel = pixelReport.captureObservations?.find((entry) => entry.captureRef === binding.captureRef);
    if (!pixel) throw new Error(`FR-DATA-05 missing FR-DATA-04 capture observation ${binding.captureRef}.`);
    records.push(Object.freeze({
      captureRef: binding.captureRef,
      relativeAssetPath: binding.relativeAssetPath,
      actualDigest: verified.actualDigest,
      contentSignature: verified.contentSignature,
      expectedRasterSha256: pixel.rasterSha256,
      target,
      route: `/asset/${index}`,
    }));
  }
  return Object.freeze(records);
}

function pageExpression(assetRecords) {
  const assets = assetRecords.map((entry) => ({
    captureRef: entry.captureRef,
    relativeAssetPath: entry.relativeAssetPath,
    actualDigest: entry.actualDigest,
    expectedRasterSha256: entry.expectedRasterSha256,
    route: entry.route,
  }));
  return `
(async () => {
  const assets = ${JSON.stringify(assets)};
  const hex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

  function measure(data, width, height) {
    const intensities = new Uint16Array(width * height);
    let min = 765;
    let max = 0;
    let sum = 0;
    let sumSquares = 0;
    let exactBlackPixelCount = 0;
    let exactWhitePixelCount = 0;
    let anyChannelZeroPixelCount = 0;
    let anyChannelFullScalePixelCount = 0;
    let xIndexWeightedSum = 0;
    let yIndexWeightedSum = 0;
    let alphaAllOpaque = true;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const offset = pixelIndex * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = data[offset + 3];
        const intensity = r + g + b;
        intensities[pixelIndex] = intensity;
        min = Math.min(min, intensity);
        max = Math.max(max, intensity);
        sum += intensity;
        sumSquares += intensity * intensity;
        if (intensity === 0) exactBlackPixelCount += 1;
        if (intensity === 765) exactWhitePixelCount += 1;
        if (r === 0 || g === 0 || b === 0) anyChannelZeroPixelCount += 1;
        if (r === 255 || g === 255 || b === 255) anyChannelFullScalePixelCount += 1;
        xIndexWeightedSum += intensity * x;
        yIndexWeightedSum += intensity * y;
        if (a !== 255) alphaAllOpaque = false;
      }
    }

    let horizontalAbsoluteDifferenceSum = 0;
    let horizontalSquaredDifferenceSum = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x + 1 < width; x += 1) {
        const current = intensities[y * width + x];
        const next = intensities[y * width + x + 1];
        const difference = Math.abs(next - current);
        horizontalAbsoluteDifferenceSum += difference;
        horizontalSquaredDifferenceSum += difference * difference;
      }
    }

    let verticalAbsoluteDifferenceSum = 0;
    let verticalSquaredDifferenceSum = 0;
    for (let y = 0; y + 1 < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const current = intensities[y * width + x];
        const next = intensities[(y + 1) * width + x];
        const difference = Math.abs(next - current);
        verticalAbsoluteDifferenceSum += difference;
        verticalSquaredDifferenceSum += difference * difference;
      }
    }

    return {
      alphaAllOpaque,
      rgbIntensity: {
        min,
        max,
        sum,
        sumSquares,
        exactBlackPixelCount,
        exactWhitePixelCount,
        anyChannelZeroPixelCount,
        anyChannelFullScalePixelCount,
      },
      adjacentIntensityDifferences: {
        horizontal: {
          pairCount: height * Math.max(0, width - 1),
          absoluteDifferenceSum: horizontalAbsoluteDifferenceSum,
          squaredDifferenceSum: horizontalSquaredDifferenceSum,
        },
        vertical: {
          pairCount: width * Math.max(0, height - 1),
          absoluteDifferenceSum: verticalAbsoluteDifferenceSum,
          squaredDifferenceSum: verticalSquaredDifferenceSum,
        },
      },
      spatialIntensityMoments: { xIndexWeightedSum, yIndexWeightedSum },
    };
  }

  async function inspect(entry, replay) {
    const base = {
      captureRef: entry.captureRef,
      relativeAssetPath: entry.relativeAssetPath,
      actualDigest: entry.actualDigest,
      rasterSha256: entry.expectedRasterSha256,
    };
    const image = new Image();
    image.decoding = 'sync';
    const event = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve('timeout'), 10000);
      image.addEventListener('load', () => { clearTimeout(timeout); resolve('load'); }, { once: true });
      image.addEventListener('error', () => { clearTimeout(timeout); resolve('error'); }, { once: true });
      image.src = location.origin + entry.route + '?frdata05Replay=' + replay;
    });
    if (event !== 'load') {
      return { ...base, status: 'measurement_error', rasterWidth: 0, rasterHeight: 0, pixelCount: 0, alphaAllOpaque: false, rgbIntensity: null, adjacentIntensityDifferences: null, spatialIntensityMoments: null, errorCode: event === 'timeout' ? 'image_load_timeout' : 'image_error_event' };
    }
    try {
      await Promise.race([
        image.decode(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('image_decode_timeout')), 10000)),
      ]);
    } catch (error) {
      return { ...base, status: 'measurement_error', rasterWidth: image.naturalWidth, rasterHeight: image.naturalHeight, pixelCount: 0, alphaAllOpaque: false, rgbIntensity: null, adjacentIntensityDifferences: null, spatialIntensityMoments: null, errorCode: error instanceof Error ? error.message : String(error) };
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { ...base, status: 'measurement_error', rasterWidth: canvas.width, rasterHeight: canvas.height, pixelCount: 0, alphaAllOpaque: false, rgbIntensity: null, adjacentIntensityDifferences: null, spatialIntensityMoments: null, errorCode: 'canvas_2d_context_unavailable' };
    try {
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const copied = new Uint8Array(imageData.data);
      const digest = 'sha256:' + hex(await crypto.subtle.digest('SHA-256', copied));
      if (digest !== entry.expectedRasterSha256) {
        return { ...base, rasterSha256: digest, status: 'measurement_error', rasterWidth: canvas.width, rasterHeight: canvas.height, pixelCount: canvas.width * canvas.height, alphaAllOpaque: false, rgbIntensity: null, adjacentIntensityDifferences: null, spatialIntensityMoments: null, errorCode: 'raster_sha256_mismatch_from_fr_data04' };
      }
      const measured = measure(imageData.data, canvas.width, canvas.height);
      return {
        ...base,
        rasterSha256: digest,
        status: 'measured',
        rasterWidth: canvas.width,
        rasterHeight: canvas.height,
        pixelCount: canvas.width * canvas.height,
        ...measured,
        errorCode: null,
      };
    } catch (error) {
      return { ...base, status: 'measurement_error', rasterWidth: canvas.width, rasterHeight: canvas.height, pixelCount: 0, alphaAllOpaque: false, rgbIntensity: null, adjacentIntensityDifferences: null, spatialIntensityMoments: null, errorCode: error instanceof Error ? error.message : String(error) };
    }
  }

  async function run(replay) {
    const output = [];
    for (const entry of assets) output.push(await inspect(entry, replay));
    return output;
  }

  const first = await run(1);
  const second = await run(2);
  return { first, second, deterministicReplay: JSON.stringify(first) === JSON.stringify(second) };
})()
`;
}

async function runMentonDatasetCaptureQualityRawObservationsFRData05(
  manifestPathInput,
  assetRootInput,
  pixelReportPathInput,
  reportPathInput,
) {
  const manifest = JSON.parse(await readFile(resolve(manifestPathInput), 'utf8'));
  validateMentonDatasetIntakeManifestFRData01(manifest);
  const pixelReport = JSON.parse(await readFile(resolve(pixelReportPathInput), 'utf8'));
  const verifiedAssets = await verifyMentonDatasetAssetFilesFRData01(manifest, assetRootInput);
  const intakeReport = buildMentonDatasetIntakeReportFRData01(manifest, verifiedAssets);
  const dimensionEvidence = await inspectMentonDatasetImageDimensionsFRData02(manifest, assetRootInput);
  const dimensionReport = buildMentonDatasetImageDimensionReportFRData02(manifest, dimensionEvidence);
  const assetRecords = await prepareAssetRecords(manifest, assetRootInput, verifiedAssets, pixelReport);
  const chrome = findChrome();
  const product = browserProduct(chrome.version);
  if (product !== pixelReport.browserRasterProvenance?.browserProduct || chrome.version !== pixelReport.browserRasterProvenance?.browserVersion) {
    throw new Error(`FR-DATA-05 browser binary must exactly match FR-DATA-04 browser provenance: ${chrome.version}`);
  }

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (requestUrl.pathname === '/fr-data05.html') {
        response.statusCode = 200;
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end('<!doctype html><meta charset="utf-8"><title>FR-DATA-05</title>');
        return;
      }
      const asset = assetRecords.find((entry) => entry.route === requestUrl.pathname);
      if (!asset) {
        response.statusCode = 404;
        response.end('not found');
        return;
      }
      const bytes = await readFile(asset.target);
      response.statusCode = 200;
      response.setHeader('content-type', asset.contentSignature);
      response.setHeader('cache-control', 'no-store');
      response.end(bytes);
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  let child = null;
  let cdp = null;
  let profileDir = null;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('FR-DATA-05 failed to resolve local server port.');
    const pageOrigin = `http://127.0.0.1:${address.port}`;
    const pageUrl = `${pageOrigin}/fr-data05.html`;
    profileDir = await mkdtemp(`${tmpdir()}/myeongha-fr-data05-`);
    child = spawn(chrome.path, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      pageUrl,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk) => process.stdout.write(`FR_DATA05_CHROME_STDOUT ${chunk}`));
    child.stderr?.on('data', (chunk) => process.stderr.write(`FR_DATA05_CHROME_STDERR ${chunk}`));

    const wsUrl = await waitForPageTarget(pageUrl);
    cdp = await connectCdp(wsUrl);
    const pageState = await waitForPageReady(cdp, pageUrl);
    const evaluation = await cdp.command('Runtime.evaluate', {
      expression: pageExpression(assetRecords),
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) throw new Error(`FR-DATA-05 browser evaluation failed: ${JSON.stringify(evaluation.exceptionDetails)}`);
    const runtime = evaluation.result?.value;
    if (!runtime || runtime.deterministicReplay !== true || !Array.isArray(runtime.first) || !Array.isArray(runtime.second)) {
      throw new Error(`FR-DATA-05 deterministic replay failed: ${JSON.stringify(runtime)}`);
    }
    for (const entry of runtime.first) {
      if (entry.status !== 'measured') throw new Error(`FR-DATA-05 measurement failure: ${JSON.stringify(entry)}`);
    }

    const rasterProvenance = pixelReport.browserRasterProvenance;
    const measurementProvenance = Object.freeze({
      protocol: 'chrome_devtools_protocol',
      measurementPrimitive: 'canvas_rgba_integer_rgb_sum_neighbors_spatial_moments',
      browserProduct: product,
      browserVersion: chrome.version,
      platform: rasterProvenance.platform,
      runnerOS: process.env.RUNNER_OS ?? null,
      runnerArch: process.env.RUNNER_ARCH ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      githubSha: process.env.GITHUB_SHA ?? null,
      verificationTimestamp: new Date().toISOString(),
      pageUrl,
      pageOrigin,
      pageReadyState: pageState.readyState,
      deterministicReplay: true,
      rasterIdentityReconfirmedBySha256: true,
      numericRepresentation: 'javascript_safe_integer',
    });

    const report = buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      manifest,
      intakeReport,
      dimensionReport,
      pixelReport,
      measurementProvenance,
      runtime.first,
    );
    const reportPath = resolve(reportPathInput);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`FR_DATA_05_CAPTURE_QUALITY_RAW ${JSON.stringify(report)}`);
    return report;
  } finally {
    if (cdp?.ws) cdp.ws.close();
    await stopChrome(child);
    if (server.listening) {
      server.close();
      await once(server, 'close').catch(() => []);
    }
    if (profileDir !== null) {
      await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

async function main() {
  const [manifestPath, assetRoot, pixelReportPath, reportPath] = process.argv.slice(2);
  if (!manifestPath || !assetRoot || !pixelReportPath || !reportPath) {
    throw new Error('Usage: node scripts/face-reading-fr-data05-capture-quality-raw-observations.mjs <manifest.json> <asset-root> <fr-data04-report.json> <report.json>');
  }
  await runMentonDatasetCaptureQualityRawObservationsFRData05(manifestPath, assetRoot, pixelReportPath, reportPath);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath !== null && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

export { runMentonDatasetCaptureQualityRawObservationsFRData05 };
