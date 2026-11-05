import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const CAP = 268435456;
// Docker-published product probes bind inside their dedicated bridge only.
const productProbe = process.env.MH_OPS_SAJU_BRIDGE === '1';
const bindHost = productProbe ? '0.0.0.0' : '127.0.0.1';
const BEARER = productProbe ? 'synthetic-saju-only-bearer' : 'isolated-phase11-rate-ladder-synthetic-only';
const numberFrom = (value, key) => {
  const line = value.split(/\r?\n/u).find(entry => entry.startsWith(key + ' '));
  if (!line) throw Error('Missing kernel counter');
  const count = Number(line.split(/\s+/u)[1]);
  if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid kernel counter');
  return count;
};
function metrics() {
  const read = name => readFileSync('/sys/fs/cgroup/' + name, 'utf8').trim();
  if (read('cpu.max') !== '50000 100000' ||
    read('memory.max') !== String(CAP) || read('memory.swap.max') !== '0') {
    throw Error('Service cgroup limits not enforced');
  }
  const cpu = read('cpu.stat');
  const memoryPeak = Number(read('memory.peak'));
  const oomKills = numberFrom(read('memory.events'), 'oom_kill');
  if (!Number.isSafeInteger(memoryPeak) || memoryPeak < 1 || memoryPeak > CAP || oomKills !== 0) {
    throw Error('Service memory cgroup invalid');
  }
  return {
    cpuCores: 0.5, memoryLimitBytes: CAP, swapLimitBytes: 0,
    cpuUsageUsec: numberFrom(cpu, 'usage_usec'),
    cpuThrottledPeriods: numberFrom(cpu, 'nr_throttled'),
    cpuThrottledUsec: numberFrom(cpu, 'throttled_usec'),
    memoryPeakBytes: memoryPeak, oomKills,
  };
}
async function main() {
  // Host orchestrator verifies the exact clean Git SHA before creating a read-only mount.
  const pkg = JSON.parse(readFileSync('/saju/package.json', 'utf8'));
  if (pkg.name !== 'myeonghwa-saju-engine') {
    throw Error('Unexpected Saju source identity');
  }
  metrics();
  const source = await import(pathToFileURL('/saju/dist/production-calculation-host.js').href);
  if (typeof source.createMyeonghwaProductionCalculationHostServer !== 'function') {
    throw Error('Real Saju calculation host unavailable');
  }
  const service = source.createMyeonghwaProductionCalculationHostServer({ serviceBearer: BEARER });
  const metricServer = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    try {
      const data = JSON.stringify(metrics());
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(data);
    } catch {
      res.writeHead(503).end();
    }
  });
  await new Promise((resolve, reject) => {
    service.once('error', reject);
    service.listen(43007, bindHost, resolve);
  });
  await new Promise((resolve, reject) => {
    metricServer.once('error', reject);
    metricServer.listen(43008, bindHost, resolve);
  });
  console.log('ISOLATED_SAJU_SPLIT_SERVICE_READY');
}
main().catch(() => {
  console.error('ISOLATED_SAJU_SPLIT_SERVICE_INCOMPLETE');
  process.exitCode = 1;
});
