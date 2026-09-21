import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { build } from 'vite';

const repositoryRoot = resolve(process.cwd());
const publicRoot = resolve(
  repositoryRoot,
  process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public',
);
const fixturePath = resolve(
  process.env.FE037_CANARY_IMAGE ??
    process.env.FE034_CANARY_IMAGE ??
    (() => {
      throw new Error('FE037_CANARY_IMAGE is required');
    })(),
);
const expectedSha256 =
  '88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5';
const runCount = 5;
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH ?? 'chrome';
const fixtureBytes = await readFile(fixturePath);
const fixtureSha256 = createHash('sha256')
  .update(fixtureBytes)
  .digest('hex');

if (fixtureSha256 !== expectedSha256) {
  throw new Error(
    `FE037 fixture SHA-256 mismatch: expected ${expectedSha256}, got ${fixtureSha256}`,
  );
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

await stat(join(publicRoot, 'face-preview', 'runtime-assets.json'));
await stat(
  join(
    publicRoot,
    'face-preview',
    'models',
    'face_landmarker.float16.v1.task',
  ),
);

const harnessRoot = await mkdtemp(
  join(repositoryRoot, 'scripts', '.fe037-harness-'),
);
const harnessOut = join(harnessRoot, 'dist');
const entryPath = join(harnessRoot, 'entry.ts');
const htmlPath = join(harnessRoot, 'index.html');
const oneShotImport = relative(
  harnessRoot,
  join(
    repositoryRoot,
    'apps',
    'web',
    'src',
    'face-preview',
    'one-shot-fe031.ts',
  ),
).replaceAll('\\\\', '/');
const loaderImport = relative(
  harnessRoot,
  join(
    repositoryRoot,
    'apps',
    'web',
    'src',
    'face-reading',
    'engine-loader-fe033.ts',
  ),
).replaceAll('\\\\', '/');

const browserHarness = `
import { runFacePreviewOneShotFE031 } from ${JSON.stringify('./' + oneShotImport)};
import { loadFacePreviewEngineFE033 } from ${JSON.stringify('./' + loaderImport)};

const RUN_COUNT = ${runCount};

window.__FE037_RESULT__ = { status: 'running' };

function metricIdentity(metric) {
  return {
    regionKey: metric.regionKey,
    metricRef: metric.metricRef,
    unit: metric.unit,
  };
}

function regionIdentity(region) {
  return {
    regionKey: region.regionKey,
    state: region.state,
    unavailableSurfaces: [...region.unavailableSurfaces],
  };
}

try {
  const response = await fetch('/__fe037_fixture.png', { cache: 'no-store' });
  if (!response.ok) throw new Error('fixture fetch failed: ' + response.status);
  const sourceBlob = await response.blob();

  const runs = [];
  for (let index = 0; index < RUN_COUNT; index += 1) {
    const result = await runFacePreviewOneShotFE031({
      schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
      blob: sourceBlob,
      loadEngineModule: loadFacePreviewEngineFE033,
      fetchImpl: fetch,
    });
    if (result.status !== 'ok') {
      throw new Error(
        'repeatability run ' +
          index +
          ' rejected at ' +
          result.rejection.stage +
          ': ' +
          result.rejection.code,
      );
    }
    runs.push({
      metrics: result.preview.metrics.map((entry) => ({
        regionKey: entry.regionKey,
        metricRef: entry.metricRef,
        value: entry.value,
        unit: entry.unit,
      })),
      regions: result.preview.regions.map(regionIdentity),
      lifecycle: result.lifecycle,
    });
  }

  const baseline = runs[0];
  const baselineMetricIdentity = JSON.stringify(
    baseline.metrics.map(metricIdentity),
  );
  const baselineRegionIdentity = JSON.stringify(baseline.regions);

  for (let index = 1; index < runs.length; index += 1) {
    const metricIdentityJson = JSON.stringify(
      runs[index].metrics.map(metricIdentity),
    );
    const regionIdentityJson = JSON.stringify(runs[index].regions);
    if (metricIdentityJson !== baselineMetricIdentity) {
      throw new Error(
        'metric identity/order drift across exact-input runs at index ' +
          index,
      );
    }
    if (regionIdentityJson !== baselineRegionIdentity) {
      throw new Error(
        'region availability drift across exact-input runs at index ' +
          index,
      );
    }
  }

  const metrics = baseline.metrics.map((baselineMetric, metricIndex) => {
    const values = runs.map((run) => run.metrics[metricIndex].value);
    const absoluteDeltas = values.map((value) =>
      Math.abs(value - baselineMetric.value),
    );
    return {
      regionKey: baselineMetric.regionKey,
      metricRef: baselineMetric.metricRef,
      unit: baselineMetric.unit,
      baseline: baselineMetric.value,
      values,
      maxAbsDelta: Math.max(...absoluteDeltas),
      meanAbsDelta:
        absoluteDeltas.reduce((sum, value) => sum + value, 0) /
        absoluteDeltas.length,
      exactEqualityCount: values.filter(
        (value) => Object.is(value, baselineMetric.value),
      ).length,
    };
  });

  window.__FE037_RESULT__ = {
    status: 'complete',
    report: {
      schemaVersion: 'fe037-neutral-observation-repeatability-evidence-v1',
      contractVersion:
        'MHA-FE037-REAL-BROWSER-NEUTRAL-OBSERVATION-REPEATABILITY-v1',
      evidenceState: 'descriptive_exact_input_repeatability_only',
      runCount: RUN_COUNT,
      fixtureBytes: sourceBlob.size,
      metricCount: baseline.metrics.length,
      regionCount: baseline.regions.length,
      structure: {
        metricIdentityStableAcrossRuns: true,
        regionAvailabilityStableAcrossRuns: true,
      },
      metrics,
      regions: baseline.regions,
      lifecycle: {
        everyRunMetadataStrippedBeforeAnalysis: runs.every(
          (run) => run.lifecycle.metadataStrippedBeforeAnalysis === true,
        ),
        everyRunSessionClosed: runs.every(
          (run) => run.lifecycle.sessionClosed === true,
        ),
        rawInputPersisted: false,
        canonicalImagePersisted: false,
        identityEmbeddingCreated: false,
      },
      authorityBoundary: {
        numericStabilityAcceptanceThresholdDefined: false,
        numericPassFailIssued: false,
        calibrationAuthorityIssued: false,
        classificationIssued: false,
        traditionalInterpretationIssued: false,
        rankingIssued: false,
      },
    },
  };
} catch (error) {
  window.__FE037_RESULT__ = {
    status: 'failed',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  };
}
`;

await writeFile(
  htmlPath,
  '<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module" src="./entry.ts"></script></body></html>',
  'utf8',
);
await writeFile(entryPath, browserHarness, 'utf8');

await build({
  configFile: false,
  root: harnessRoot,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: harnessOut,
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: htmlPath,
    },
  },
});

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

function safeFile(root, pathname) {
  const relativePath = normalize(pathname).replace(/^[/\\]+/, '');
  const file = resolve(root, relativePath);
  assert(
    file === root || file.startsWith(`${root}${sep}`),
    'request escaped static root',
  );
  return file;
}

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/__fe037_fixture.png') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.end(fixtureBytes);
        return;
      }

      const isRuntimeAsset = url.pathname.startsWith('/face-preview/');
      const root = isRuntimeAsset ? publicRoot : harnessOut;
      const pathname =
        !isRuntimeAsset && url.pathname === '/'
          ? '/index.html'
          : decodeURIComponent(url.pathname);
      const file = safeFile(root, pathname);
      assert((await stat(file)).isFile(), 'not a file');
      res.setHeader(
        'Content-Type',
        mime.get(extname(file).toLowerCase()) ??
          'application/octet-stream',
      );
      createReadStream(file).pipe(res);
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(
    address && typeof address === 'object',
    'static server address unavailable',
  );
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function devtoolsPort(profile, process) {
  for (let index = 0; index < 120; index += 1) {
    assert(
      process.exitCode === null,
      `Chrome exited early (${process.exitCode})`,
    );
    try {
      const [port] = (
        await readFile(join(profile, 'DevToolsActivePort'), 'utf8')
      )
        .trim()
        .split(/\r?\n/u);
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools port timeout');
}

async function cdp(port) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?about%3Ablank`,
    { method: 'PUT' },
  );
  assert(
    response.ok,
    `Chrome target create failed: ${response.status}`,
  );
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    ws.addEventListener('open', done, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      request.reject(
        new Error(`${request.method}: ${message.error.message}`),
      );
    } else {
      request.resolve(message.result ?? {});
    }
  });

  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const requestId = ++id;
      pending.set(requestId, {
        method,
        resolve: done,
        reject,
      });
      ws.send(
        JSON.stringify({
          id: requestId,
          method,
          params,
        }),
      );
    });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert(
      !result.exceptionDetails,
      `Runtime.evaluate failed: ${
        result.exceptionDetails?.text ?? 'unknown'
      }`,
    );
    return result.result?.value;
  };

  await Promise.all([
    send('Page.enable'),
    send('Runtime.enable'),
  ]);
  return {
    send,
    evaluate,
    close: () => ws.close(),
  };
}

const { server, origin } = await serve();
const profile = await mkdtemp(
  join(tmpdir(), 'myeongha-fe037-repeatability-'),
);
const chrome = spawn(
  chromeBin,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => {
  chromeError += chunk;
});
let client;

async function stopChrome() {
  if (chrome.exitCode !== null) return;
  chrome.kill('SIGTERM');
  await Promise.race([
    new Promise((done) => chrome.once('exit', done)),
    sleep(2_000),
  ]);
  if (chrome.exitCode === null) {
    chrome.kill('SIGKILL');
    await new Promise((done) => chrome.once('exit', done));
  }
}

try {
  const port = await devtoolsPort(profile, chrome);
  client = await cdp(port);
  const browserVersion = await client.send('Browser.getVersion');
  const navigation = await client.send('Page.navigate', {
    url: `${origin}/index.html`,
  });
  assert(
    !navigation.errorText,
    `navigation failed: ${navigation.errorText}`,
  );

  const deadline = Date.now() + 120_000;
  let browserResult = null;
  while (Date.now() < deadline) {
    browserResult = await client.evaluate(
      'globalThis.__FE037_RESULT__ ?? null',
    );
    if (
      browserResult?.status === 'complete' ||
      browserResult?.status === 'failed'
    ) {
      break;
    }
    await sleep(200);
  }

  assert(
    browserResult?.status !== 'failed',
    `FE037 browser harness failed: ${browserResult?.error ?? 'unknown'}`,
  );
  assert(
    browserResult?.status === 'complete',
    'FE037 browser harness timed out before evidence completion.',
  );

  const report = Object.freeze({
    ...browserResult.report,
    fixture: Object.freeze({
      sourceRepository: 'scikit-image/scikit-image',
      sourceCommit:
        '9311ab50b2e3392bb5272253b43cb4dd1ce04e31',
      sourcePath: 'src/_skimage2/data/astronaut.png',
      gitBlob: '834cda0012478c5edc8d43bade96d315dedeaab4',
      sha256: fixtureSha256,
      byteLength: fixtureBytes.length,
      nonUserTestFixture: true,
    }),
    browser: Object.freeze({
      product: browserVersion.product ?? null,
      revision: browserVersion.revision ?? null,
      userAgent: browserVersion.userAgent ?? null,
    }),
  });

  const artifactsDir = join(repositoryRoot, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });
  const artifactPath = join(
    artifactsDir,
    'face-observation-repeatability-fe037.json',
  );
  await writeFile(
    artifactPath,
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );

  process.stdout.write(
    JSON.stringify({
      status:
        'FE037_REAL_BROWSER_NEUTRAL_OBSERVATION_REPEATABILITY_EVIDENCE_RECORDED',
      runCount: report.runCount,
      metricCount: report.metricCount,
      regionCount: report.regionCount,
      structure: report.structure,
      metricDeltas: report.metrics.map((metric) => ({
        metricRef: metric.metricRef,
        maxAbsDelta: metric.maxAbsDelta,
        meanAbsDelta: metric.meanAbsDelta,
        exactEqualityCount: metric.exactEqualityCount,
      })),
      numericStabilityAcceptanceThresholdDefined: false,
      calibrationAuthorityIssued: false,
      artifactPath: 'artifacts/face-observation-repeatability-fe037.json',
    }) + '\n',
  );
} catch (error) {
  if (chromeError.trim()) {
    process.stderr.write(chromeError.slice(-6000));
  }
  throw error;
} finally {
  client?.close();
  await new Promise((done) => server.close(done));
  await stopChrome();
  await rm(profile, { recursive: true, force: true });
  await rm(harnessRoot, { recursive: true, force: true });
}
