#!/usr/bin/env node
// Watchtower-Track: security
// One-command, ZERO PAID API local Docker smoke on Windows Docker Desktop.
// A: synthetic authenticated Node TLS / DB / Provider with --network none.
// B: existing disposable PostgreSQL17 1510-frontier census with --network none.
// No real OpenAI calls, production DB connection, host-mounted secrets, or ports.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

export const SEYEON_ZERO_COST_DOCKER_CONTRACT_V1 = Object.freeze({
  version: 'seyeon-zero-cost-disposable-docker-v1',
  phases: ['synthetic-direct-https', 'disposable-postgres17-c08', 'disposable-postgres17-locked-first-zero'] ,
  runtimeNetwork: 'none',
  hostPortsPublished: false,
  hostSourceMounted: false,
  productionDataUsed: false,
  externalAiRequests: false,
  remoteDockerContextsAccepted: false,
  productionVercelRevealActivated: false,
  separateProductionServerRequiredForThisTest: false,
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dockerfile = 'scripts/local/seyeon-zero-cost.Dockerfile';
const imagePrefix = 'myeongha-seyeon-zero-cost-local';
const localDockerHost = /^(?:unix:\/\/|npipe:\/\/)/u;

function command(bin, args, options = {}) {
  const outcome = spawnSync(bin, args, {
    cwd: root,
    stdio: options.capture === true ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    timeout: options.timeout ?? 1_800_000,
    shell: false,
    windowsHide: true,
  });
  if (outcome.error || outcome.signal || outcome.status !== 0) {
    const stage = options.stage ?? 'UNKNOWN';
    throw Error('HOLD_SEYEON_ZERO_COST_DOCKER_' + stage);
  }
  return options.capture === true ? (outcome.stdout ?? '').trim() : '';
}

function checkLocalDockerEngine() {
  // Docker Desktop for Windows uses npipe; native/rootless Linux uses unix.
  // Reject SSH/TCP contexts that could bill for or alter a remote host.
  const host = command('docker', [
    'context', 'inspect', '--format', '{{ (index .Endpoints "docker").Host }}',
  ], { capture: true, timeout: 15_000, stage: 'CONTEXT' });
  if (!localDockerHost.test(host)) {
    throw Error('HOLD_SEYEON_ZERO_COST_DOCKER_REMOTE_ENGINE_FORBIDDEN');
  }
  const override = process.env.DOCKER_HOST;
  if (override !== undefined && override.length > 0 &&
      !localDockerHost.test(override)) {
    throw Error('HOLD_SEYEON_ZERO_COST_DOCKER_REMOTE_ENGINE_FORBIDDEN');
  }
  if (process.env.BUILDX_BUILDER) {
    throw Error('HOLD_SEYEON_ZERO_COST_DOCKER_REMOTE_BUILDER_FORBIDDEN');
  }
  command('docker', ['info', '--format', '{{.ServerVersion}}'], {
    capture: true, timeout: 15_000, stage: 'ENGINE',
  });
}

export function zeroCostDockerCommandPlanV1(image) {
  if (typeof image !== 'string' ||
      !/^myeongha-seyeon-zero-cost-local:[0-9a-f]{12}$/u.test(image)) {
    throw Error('Invalid disposable Docker image tag');
  }
  return Object.freeze({
    build: Object.freeze([
      'build', '--file', dockerfile, '--tag', image, '.',
    ]),
    run: Object.freeze([
      'run', '--rm', '--network', 'none',
      '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--pids-limit', '256',
      '--memory', '2g',
      '--cpus', '2',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
      image,
    ]),
    clean: Object.freeze(['image', 'rm', '--force', image]),
  });
}

export async function runSeyeonZeroCostDockerV1(args) {
  if (args.length !== 1 || args[0] !== '--disposable-only') {
    throw Error('HOLD_SEYEON_ZERO_COST_DOCKER_EXPLICIT_DISPOSABLE_FLAG_REQUIRED');
  }
  checkLocalDockerEngine();
  const tag = imagePrefix + ':' + randomBytes(6).toString('hex');
  const plan = zeroCostDockerCommandPlanV1(tag);
  let built = false;
  try {
    process.stdout.write('SEYEON_ZERO_COST_DOCKER_BUILD_PUBLIC_DEPENDENCIES_ONLY\n');
    command('docker', plan.build, { timeout: 1_800_000, stage: 'BUILD' });
    built = true;
    process.stdout.write('SEYEON_ZERO_COST_DOCKER_REAL_TLS_SYNTHETIC_START\n');
    command('docker', plan.run, { timeout: 600_000, stage: 'SYNTHETIC_TLS' });
    process.stdout.write('PASS_SEYEON_ZERO_COST_DOCKER_SYNTHETIC_TLS\n');

    // Reuse the existing, well-scoped scratch PG17 test. No host credentials,
    // Docker ports/volumes, real Person or model calls are passed to it.
    process.stdout.write('SEYEON_ZERO_COST_DOCKER_DISPOSABLE_PG17_START\n');
    command(process.execPath, [
      'scripts/run-seyeon-c08-local-docker-pg17.mjs', '--disposable-only',
    ], { timeout: 1_800_000, stage: 'PG17' });
    process.stdout.write('PASS_SEYEON_ZERO_COST_DOCKER_DISPOSABLE_PG17\n');

    // A fresh and entirely separate disposable PG17 database replays the
    // exact 20261018190000 function (with its 1640 schema dependencies),
    // synthetic first committed turn, executor ACL and independent lock race.
    process.stdout.write('SEYEON_ZERO_COST_DOCKER_FIRST_ZERO_LOCKED_PG17_START\n');
    command(process.execPath, [
      'scripts/run-seyeon-c08-local-docker-pg17.mjs',
      '--first-zero-disposable-only',
    ], { timeout: 1_800_000, stage: 'FIRST_ZERO_PG17' });
    process.stdout.write('PASS_SEYEON_ZERO_COST_DOCKER_FIRST_ZERO_LOCKED_PG17\n');
    process.stdout.write('PASS_SEYEON_ZERO_COST_DOCKER_ALL_OFFLINE_PHASES\n');
  } finally {
    if (built) {
      try {
        command('docker', plan.clean, { timeout: 120_000, stage: 'CLEANUP' });
      } catch {
        // Do not suppress a test failure or silently claim cleanup.
        process.stderr.write('HOLD_SEYEON_ZERO_COST_DOCKER_IMAGE_CLEANUP\n');
        process.exitCode = 1;
      }
    }
  }
}

const direct = typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  runSeyeonZeroCostDockerV1(process.argv.slice(2)).catch((error) => {
    // No credential, Docker context address, network endpoint or user data.
    const code = error instanceof Error &&
      /^HOLD_SEYEON_ZERO_COST_DOCKER_[A-Z_]+$/u.test(error.message)
      ? error.message
      : 'HOLD_SEYEON_ZERO_COST_DOCKER_UNKNOWN';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}
