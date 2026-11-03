import { validateSajuFourClientWavesReport } from './validate-isolated-saju-four-client-waves-phase11.mjs';
import { validateSajuSustainedReport } from './validate-isolated-saju-sustained-phase11.mjs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const SHA = '9807ce89c08afc61b587560d515a475efd819032';
const SCHEMA = 'myeongha-ops-saju-split-cgroup-rate-ladder-phase11-v1';
const CAP = 268435456;
const BLOCKED = {
  schema: SCHEMA, status: 'BLOCKED_INCOMPLETE',
  saturationKneeApproved: false, sajuSaturationCeilingProven: false,
  productionSajuCpuMemoryCeilingProven: false, productionCapacityProven: false,
  productionScalingThresholdApproved: false, drReady: false,
  serviceResumptionAllowed: false, outputContainsIdentifiers: false,
};
const call = (bin, args, timeout = 30000) => execFileSync(bin, args, {
  encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024,
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const required = (test, message) => { if (!test) throw Error(message); };
const sum = (array, key) => array.reduce((n, item) => n + item[key], 0);
const safe = n => Number.isSafeInteger(n) && n >= 0;

function validate(result) {
  required(result.schema === SCHEMA && result.status === 'OBSERVED_SPLIT_CGROUP_RATE_LADDER' &&
    result.sourceSha === SHA && result.separateResourceCgroups === true &&
    result.actualSajuProductionHostUsed === true && result.syntheticInputOnly === true &&
    result.networkScope === 'shared-offline-network-namespace-loopback-only' &&
    result.kernelConstraints.serviceCpuCores === 0.5 &&
    result.kernelConstraints.driverCpuCores === 1 &&
    result.kernelConstraints.serviceMemoryLimitBytes === CAP &&
    result.kernelConstraints.driverMemoryLimitBytes === CAP &&
    result.kernelConstraints.serviceSwapLimitBytes === 0 &&
    result.kernelConstraints.driverSwapLimitBytes === 0 &&
    result.rates?.length === 6 && result.totalPlannedSlots === 4710 &&
    result.totalPlannedSlots === sum(result.rates, 'plannedSlots') &&
    result.totalActualAttempts === sum(result.rates, 'attempted') &&
    result.totalSuccessfulCalculations === sum(result.rates, 'successfulCalculations') &&
    result.postPressureRecoverySucceeded === true &&
    result.serviceMemoryOomKills === 0 && result.driverMemoryOomKills === 0 &&
    result.outputContainsIdentifiers === false, 'Split-cgroup contract incomplete');
  for (const [index, target] of [10, 25, 50, 100, 200, 400].entries()) {
    const r = result.rates[index];
    required(r.targetRps === target && r.intervalSeconds === 6 &&
      r.plannedSlots === target * 6 &&
      r.attempted + r.skippedSchedulingLag + r.skippedInFlightCap === r.plannedSlots &&
      r.successfulCalculations + r.non200 + r.transportFailures + r.invalidResponses === r.attempted &&
      r.maxInFlightObserved >= 0 && r.maxInFlightObserved <= 16 &&
      ['serviceCpuUsecDelta', 'driverCpuUsecDelta',
        'serviceCpuThrottledPeriodsDelta', 'driverCpuThrottledPeriodsDelta',
        'serviceCpuThrottledUsecDelta', 'driverCpuThrottledUsecDelta'].every(key => safe(r[key])) &&
      r.servicePeakMemoryBytes > 0 && r.servicePeakMemoryBytes <= CAP &&
      r.driverPeakMemoryBytes > 0 && r.driverPeakMemoryBytes <= CAP,
    'Split stage accounting or resource proof invalid');
  }
  for (const k of ['serviceTotalCpuUsec', 'driverTotalCpuUsec',
    'serviceTotalThrottledPeriods', 'driverTotalThrottledPeriods',
    'serviceTotalThrottledUsec', 'driverTotalThrottledUsec']) required(safe(result[k]), 'Missing kernel totals');
  for (const k of ['saturationKneeApproved', 'sajuSaturationCeilingProven',
    'productionSajuCpuMemoryCeilingProven', 'productionCapacityProven',
    'productionScalingThresholdApproved', 'drReady', 'serviceResumptionAllowed']) {
    required(result[k] === false, 'Unapproved production claim');
  }
  required(result.servicePeakMemoryBytes > 0 && result.servicePeakMemoryBytes <= CAP &&
    result.driverPeakMemoryBytes > 0 && result.driverPeakMemoryBytes <= CAP, 'Memory peak invalid');
  return result;
}
async function main(argv) {
  const local = argv.includes('--local');
  const sustained = argv.includes('--sustained');
  const fourClientWaves = argv.includes('--four-client-waves');
  required(!(sustained && fourClientWaves), 'Cannot combine independent measurements');
  const parts = argv.filter(x => x !== '--local' && x !== '--sustained' && x !== '--four-client-waves');
  required(parts.length === 4 && parts[0] === '--saju-repo' && parts[2] === '--out',
    'Required arguments: --saju-repo <path> --out <file> [--local] [--sustained | --four-client-waves]');
  const saju = resolve(parts[1]), out = resolve(parts[3]);
  writeFileSync(out, JSON.stringify({
    ...BLOCKED,
    schema: fourClientWaves ? 'myeongha-ops-saju-split-cgroup-four-client-waves-phase11-v1' :
      sustained ? 'myeongha-ops-saju-split-cgroup-sustained-phase11-v1' : SCHEMA,
  }, null, 2) + '\n', 'utf8');
  let server;
  try {
    if (process.env.GITHUB_ACTIONS === 'true') {
      required(!local && process.env.GITHUB_REPOSITORY === 'gycha0109-beep/MyeongHa' &&
        process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
        process.env.GITHUB_REF === 'refs/heads/main' &&
        /^[0-9a-f]{40}$/u.test(process.env.GITHUB_SHA ?? '') &&
        resolve(process.env.GITHUB_WORKSPACE ?? '') === process.cwd(),
      'Requires exact GitHub main manual dispatch');
      required(call('git', ['rev-parse', 'HEAD']) === process.env.GITHUB_SHA, 'MyeongHa head mismatch');
    } else {
      required(local, 'Standalone execution requires explicit --local');
    }
    for (const key of [
      'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_DB_PASSWORD', 'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_SECRET_KEY', 'SUPABASE_PROJECT_ID',
      'SAJU_PRODUCTION_SERVICE_BEARER', 'SAJU_PRODUCTION_PREVIOUS_SERVICE_BEARER',
    ]) required(!process.env[key], 'Production configuration forbidden');
    required(existsSync(resolve(saju, 'dist', 'production-calculation-host.js')),
      'Built Saju engine missing');
    const sourceSha = call('git', ['-C', saju, 'rev-parse', 'HEAD']);
    const dirty = call('git', ['-C', saju, 'status', '--porcelain']);
    required(sourceSha === SHA && dirty.length === 0, 'Pinned clean Saju source required');
    const pkg = JSON.parse(readFileSync(resolve(saju, 'package.json'), 'utf8'));
    required(pkg.name === 'myeonghwa-saju-engine', 'Unexpected Saju package');
    call('docker', ['pull', 'node:24-bookworm-slim'], 120000);
    const image = call('docker', ['image', 'inspect', 'node:24-bookworm-slim',
      '--format', '{{index .RepoDigests 0}}']);
    required(/^[^\s]+@sha256:[a-f0-9]{64}$/u.test(image), 'Node image not content pinned');
    const scripts = resolve('scripts', 'operations');
    const id = 'mh-saju-split-' + randomUUID().slice(0, 12);
    const base = [
      '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
      '--pids-limit=128', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--user=65534:65534',
    ];
    const readonly = (source, target) => ['--mount',
      'type=bind,source=' + source + ',target=' + target + ',readonly'];
    const serviceScript = resolve(scripts, 'saju-split-service-phase11.mjs');
    const driverScript = resolve(scripts, sustained || fourClientWaves ?
      'measure-isolated-saju-sustained-phase11.mjs' :
      'measure-isolated-saju-split-rate-ladder-phase11.mjs');
    const cid = call('docker', [
      'run', '--rm', '-d', '--pull=never', '--name', id,
      '--network=none', '--cpus=0.50', '--memory=256m', '--memory-swap=256m',
      ...base, ...readonly(saju, '/saju'),
      ...readonly(serviceScript, '/usr/local/bin/mh-saju-service.mjs'),
      image, 'node', '/usr/local/bin/mh-saju-service.mjs',
    ]);
    required(/^[a-f0-9]{64}$/u.test(cid), 'Cannot start isolated service container');
    server = cid;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const logs = call('docker', ['logs', cid], 5000);
      if (logs.includes('ISOLATED_SAJU_SPLIT_SERVICE_READY')) { ready = true; break; }
      const running = call('docker', ['inspect', '-f', '{{.State.Running}}', cid]);
      required(running === 'true', 'Saju service container exited');
      await sleep(250);
    }
    required(ready, 'Service not ready before timeout');
    const stdout = call('docker', [
      'run', '--rm', '--pull=never',
      '--network=container:' + cid,
      '--cpus=1.00', '--memory=256m', '--memory-swap=256m',
      ...base, ...readonly(driverScript, '/usr/local/bin/mh-saju-driver.mjs'),
      image, 'node', '/usr/local/bin/mh-saju-driver.mjs',
      ...(fourClientWaves ? ['--four-client-waves'] : []),
    ], sustained ? 1_320_000 : fourClientWaves ? 1_020_000 : 120000);
    required(stdout.split(/\r?\n/u).length === 1, 'Unexpected driver stdout');
    const report = fourClientWaves ? validateSajuFourClientWavesReport(JSON.parse(stdout)) :
      sustained ? validateSajuSustainedReport(JSON.parse(stdout)) :
        validate(JSON.parse(stdout));
    const result = {
      ...report,
      nodeImageDigest: image,
      ...(process.env.GITHUB_ACTIONS === 'true' ?
        { githubMainSha: process.env.GITHUB_SHA } :
        { localValidationOnly: true }),
    };
    required(call('docker', ['inspect', '-f', '{{.State.Running}}', cid]) === 'true',
      'Saju service not alive after exercise');
    writeFileSync(out, JSON.stringify(result, null, 2) + '\n', 'utf8');
    console.log(fourClientWaves ?
      'ISOLATED_SAJU_FOUR_CLIENT_WAVES_OBSERVED: 4 overlapping client request promises; actual host CPU concurrency not proven' :
      sustained ? 'ISOLATED_SAJU_SUSTAINED_OBSERVED: actual 5m/15m Linux split-cgroup envelopes; production approval blocked' :
        'ISOLATED_SAJU_SPLIT_CGROUP_OBSERVED: actual Saju and driver separately constrained; production approval remains blocked');
  } finally {
    if (server) {
      try { call('docker', ['rm', '-f', server], 10000); } catch { /* best-effort isolated cleanup */ }
    }
  }
}
main(process.argv.slice(2)).catch(error => {
  console.error('ISOLATED_SAJU_SPLIT_CGROUP_INCOMPLETE: no capacity approval');
  if (process.argv.includes('--local')) {
    console.error('LOCAL_PRECHECK: ' + String(error.message).split('\n')[0].slice(0, 180));
  }
  process.exitCode = 1;
});
