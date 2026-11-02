import { execFile as execFileCallback, fork } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const STAGES = Object.freeze([
  { concurrency: 1, count: 20 },
  { concurrency: 2, count: 20 },
  { concurrency: 4, count: 24 },
  { concurrency: 8, count: 32 },
]);
const MAX_ATTEMPTS = STAGES.reduce((sum, stage) => sum + stage.count, 0);
const SYNTHETIC_TOKEN = 'myeongha-ops-local-synthetic-only-not-a-service-credential';
const SYNTHETIC_REQUEST = JSON.stringify({
  birth: {
    calendarType: 'solar',
    date: '2001-07-14',
    time: '15:20',
    sex: 'unspecified',
  },
});
const RESPONSE_BYTES_MAX = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const WORKER_TIMEOUT_MS = 25_000;
const scriptPath = fileURLToPath(import.meta.url);

function assert(ok, reason) {
  if (!ok) throw Error('ISOLATED_SAJU_CAPACITY: ' + reason);
}
function round(x) { return Math.round(x * 1000) / 1000; }
function quantile(numbers, fraction) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const x = (sorted.length - 1) * fraction;
  const lo = Math.floor(x), hi = Math.ceil(x);
  return round(sorted[lo] + (sorted[hi] - sorted[lo]) * (x - lo));
}

async function worker(distFile) {
  const mod = await import(pathToFileURL(distFile).href);
  assert(typeof mod.createMyeonghwaProductionCalculationHostServer === 'function',
    'The actual Saju production calculation host export is required');
  const server = mod.createMyeonghwaProductionCalculationHostServer({
    serviceBearer: SYNTHETIC_TOKEN,
  });
  await new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(0, '127.0.0.1', ok);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', 'No isolated server address');
  let startCpu = null;
  let peakRssBytes = process.memoryUsage().rss;
  let startedAt = null;
  let sampler = null;
  const send = (message) => process.send?.(message);
  const shutdown = async () => {
    if (sampler) clearInterval(sampler);
    server.closeAllConnections();
    await new Promise((ok, bad) => server.close(err => err ? bad(err) : ok()));
  };
  process.on('message', async message => {
    if (!message || typeof message !== 'object') return;
    try {
      if (message.type === 'start-stage') {
        assert(startCpu === null, 'A previous stage is still running');
        startCpu = process.cpuUsage();
        peakRssBytes = process.memoryUsage().rss;
        startedAt = performance.now();
        sampler = setInterval(() => {
          peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
        }, 20);
        send({ type: 'started', id: message.id });
      } else if (message.type === 'end-stage') {
        assert(startCpu !== null && startedAt !== null, 'No active stage');
        if (sampler) clearInterval(sampler);
        sampler = null;
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
        const elapsedMs = performance.now() - startedAt;
        const cpu = process.cpuUsage(startCpu);
        startCpu = null;
        startedAt = null;
        send({
          type: 'ended', id: message.id,
          observedServerCpuMs: round((cpu.user + cpu.system) / 1000),
          observedServerUserCpuMs: round(cpu.user / 1000),
          observedServerSystemCpuMs: round(cpu.system / 1000),
          observedServerPeakRssMiB: round(peakRssBytes / (1024 * 1024)),
          observedServerFinalRssMiB: round(process.memoryUsage().rss / (1024 * 1024)),
          observedServerStageElapsedMs: round(elapsedMs),
        });
      } else if (message.type === 'stop') {
        await shutdown();
        send({ type: 'stopped', id: message.id });
        process.disconnect?.();
      }
    } catch {
      send({ type: 'failed', id: message.id });
      process.exitCode = 1;
    }
  });
  send({ type: 'ready', port: address.port });
}

function ipcReply(child, request, responseType, timeoutMs = WORKER_TIMEOUT_MS) {
  return new Promise((resolveReply, rejectReply) => {
    const id = request.id;
    const timeout = setTimeout(() => finish(Error('Isolated Saju worker IPC deadline exceeded')), timeoutMs);
    const onMessage = message => {
      if (message?.id !== id) return;
      if (message.type === 'failed') finish(Error('Isolated Saju worker stage failed'));
      else if (message.type === responseType) finish(null, message);
    };
    const onExit = () => finish(Error('Isolated Saju worker exited'));
    function finish(error, value) {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
      if (error) rejectReply(error); else resolveReply(value);
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
    try { child.send(request); } catch (error) { finish(error); }
  });
}

async function launchWorker(distFile) {
  const safeEnv = { NODE_ENV: 'test' };
  for (const name of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'HOME', 'TMPDIR']) {
    if (process.env[name]) safeEnv[name] = process.env[name];
  }
  const child = fork(scriptPath, ['--isolated-worker', distFile], {
    execArgv: [],
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: safeEnv,
    windowsHide: true,
  });
  let diagnostics = '';
  child.stderr?.on('data', chunk => {
    diagnostics = (diagnostics + String(chunk)).slice(-2048);
  });
  const ready = await new Promise((ok, bad) => {
    const timeout = setTimeout(() => end(Error('Isolated Saju engine did not start')), WORKER_TIMEOUT_MS);
    const onMsg = m => { if (m?.type === 'ready') end(null, m); };
    const onExit = () => end(Error('Isolated Saju engine terminated during startup'));
    function end(error, value) {
      clearTimeout(timeout);
      child.off('message', onMsg);
      child.off('exit', onExit);
      if (error) bad(error); else ok(value);
    }
    child.on('message', onMsg);
    child.once('exit', onExit);
  }).catch(error => {
    child.kill();
    throw Error(error.message + (diagnostics ? ' (stderr present; suppressed)' : ''));
  });
  assert(Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536,
    'Invalid local Saju worker port');
  return { child, port: ready.port };
}

async function requestActualSaju(port) {
  const start = performance.now();
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/api/calculations', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + SYNTHETIC_TOKEN,
        'content-type': 'application/json',
      },
      body: SYNTHETIC_REQUEST,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const bytes = await response.arrayBuffer();
    assert(bytes.byteLength < RESPONSE_BYTES_MAX, 'Saju calculation response size exceeded limit');
    assert(response.headers.get('location') === null, 'Unexpected upstream redirect');
    if (response.status !== 200) {
      return { kind: 'non200', status: response.status, ms: performance.now() - start };
    }
    const result = JSON.parse(new TextDecoder().decode(bytes));
    assert(typeof result.responseSchemaVersion === 'string' &&
      result.snapshot?.calculationHash?.length > 0,
    'Actual calculation response shape invalid');
    return { kind: 'ok', ms: performance.now() - start };
  } catch (error) {
    if (error?.message?.startsWith?.('ISOLATED_SAJU_CAPACITY:')) throw error;
    return { kind: 'transport', ms: performance.now() - start };
  }
}

async function measure(child, port, stage, index) {
  await ipcReply(child, { type: 'start-stage', id: 'begin-' + index }, 'started');
  const results = [];
  let next = 0;
  const start = performance.now();
  try {
    await Promise.all(Array.from({ length: stage.concurrency }, async () => {
      while (next < stage.count) {
        next++;
        results.push(await requestActualSaju(port));
      }
    }));
  } catch (error) {
    await ipcReply(child, { type: 'end-stage', id: 'failed-end-' + index }, 'ended');
    throw error;
  }
  const elapsedMs = performance.now() - start;
  const resource = await ipcReply(child, { type: 'end-stage', id: 'end-' + index }, 'ended');
  assert(results.length === stage.count, 'Missing measured requests');
  const good = results.filter(r => r.kind === 'ok').map(r => r.ms);
  return {
    concurrency: stage.concurrency,
    attempted: stage.count,
    completed: good.length,
    non200: results.filter(r => r.kind === 'non200').length,
    transportFailures: results.filter(r => r.kind === 'transport').length,
    successfulP50Ms: quantile(good, 0.5),
    successfulP95Ms: quantile(good, 0.95),
    successfulP99Ms: quantile(good, 0.99),
    observedElapsedMs: round(elapsedMs),
    completedPerSecond: round(good.length * 1000 / elapsedMs),
    observedServerCpuMs: resource.observedServerCpuMs,
    observedServerUserCpuMs: resource.observedServerUserCpuMs,
    observedServerSystemCpuMs: resource.observedServerSystemCpuMs,
    observedServerPeakRssMiB: resource.observedServerPeakRssMiB,
    observedServerFinalRssMiB: resource.observedServerFinalRssMiB,
  };
}

async function main(argv) {
  assert(argv.length === 2 && argv[0] === '--saju-repo',
    'Require --saju-repo <a local Saju source checkout with completed npm build>');
  const repo = resolve(argv[1]);
  assert(isAbsolute(repo) && !repo.startsWith('\\\\'), 'Local Saju repository path required');
  const manifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  assert(manifest.name === 'myeonghwa-saju-engine', 'Wrong Saju package');
  const distFile = join(repo, 'dist', 'production-calculation-host.js');
  await access(distFile);
  const sha = (await execFile('git', ['-C', repo, 'rev-parse', 'HEAD'],
    { timeout: 5000, windowsHide: true })).stdout.trim();
  assert(/^[0-9a-f]{40}$/u.test(sha), 'Cannot establish actual Saju source SHA');
  const status = (await execFile('git', ['-C', repo, 'status', '--porcelain'],
    { timeout: 5000, windowsHide: true })).stdout.trim();
  assert(status.length === 0, 'Saju source checkout must be clean');
  const { child, port } = await launchWorker(distFile);
  let stopped = false;
  try {
    const baseline = await requestActualSaju(port);
    assert(baseline.kind === 'ok', 'Actual Saju engine warmup failed');
    const observations = [];
    for (let index = 0; index < STAGES.length; index++) {
      observations.push(await measure(child, port, STAGES[index], index));
    }
    const recovered = await requestActualSaju(port);
    assert(recovered.kind === 'ok', 'Actual Saju engine failed post-pressure recovery');
    assert(observations.every(x => x.completed + x.non200 + x.transportFailures === x.attempted),
      'Incomplete Saju result accounting');
    console.log(JSON.stringify({
      schema: 'myeongha-local-real-saju-capacity-observation-phase11-v1',
      status: 'OBSERVED',
      sajuSourceSha: sha,
      target: 'child-process-127.0.0.1-only',
      usesActualSajuProductionCalculationHost: true,
      syntheticInputOnly: true,
      requiresLocalPrebuiltSaju: true,
      stageCount: STAGES.length,
      attempted: MAX_ATTEMPTS,
      observedPostPressureRecovery: true,
      observations,
      sajuSaturationCeilingProven: false,
      productionSajuCpuMemoryCeilingProven: false,
      productionCapacityProven: false,
      productionScalingThresholdApproved: false,
      drReady: false,
      serviceResumptionAllowed: false,
      outputContainsIdentifiers: false,
    }));
    await ipcReply(child, { type: 'stop', id: 'shutdown' }, 'stopped');
    stopped = true;
  } finally {
    if (!stopped) child.kill();
  }
}

if (process.argv[2] === '--isolated-worker') {
  await worker(process.argv[3]);
} else {
  await main(process.argv.slice(2)).catch(error => {
    console.error(error?.message?.startsWith?.('ISOLATED_SAJU_CAPACITY:')
      ? error.message : 'ISOLATED_SAJU_CAPACITY: measurement failed safely');
    process.exitCode = 1;
  });
}
