import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const runner = fileURLToPath(new URL('../scripts/run-seyeon-c08-local-docker-pg17.mjs', import.meta.url));
const script = readFileSync(runner, 'utf8');

// Docker CLI stand-in: models a successful pg_isready-compatible TEMPORARY
// postmaster, a later PID1 postgres, and a transient failed SQL probe. No
// Docker daemon, database, network, cloud service or paid API is contacted.
const fakeDocker = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const tracePath = process.env.C08L_FAKE_TRACE;
const mode = process.env.C08L_FAKE_MODE;
const events = fs.existsSync(tracePath) ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : [];
function record(event) {
  events.push(event);
  fs.writeFileSync(tracePath, JSON.stringify(events));
}
if (args[0] === 'run') {
  if (!args.includes('--network') || !args.includes('none') ||
      !args.some(a => a.includes('target=/repo,readonly')) ||
      !args.includes('--rm') || args.includes('--publish')) process.exit(18);
  record('isolated-run');
  process.stdout.write('fake-container-id\n');
} else if (args[0] === 'exec') {
  if (args.includes('/proc/1/comm')) {
    const num = events.filter(e => e.startsWith('pid1:')).length + 1;
    const final = num >= 3;
    record(final ? 'pid1:postgres' : 'pid1:docker-entrypoint');
    process.stdout.write(final ? 'postgres\n' : 'sh\n');
  } else if (args.includes('psql') && args.includes('select 1;')) {
    if (!events.includes('pid1:postgres')) process.exit(19);
    const probed = events.some(e => e.startsWith('sql-probe:'));
    if (!probed) {
      record('sql-probe:temporarily-unavailable');
      process.stderr.write('simulated final postmaster starting\n');
      process.exit(2);
    }
    record('sql-probe:success');
    process.stdout.write('1\n');
  } else if (args.includes('createdb')) {
    if (!events.includes('sql-probe:success')) process.exit(20);
    record('createdb');
    if (mode === 'createdb-fails') {
      process.stderr.write('synthetic createdb failure\n');
      process.exit(21);
    }
  } else if (args.includes('psql') && args.includes('show server_version_num;')) {
    if (!events.includes('createdb')) process.exit(22);
    record('version');
    process.stdout.write('170006\n');
  } else if (args.includes('bash')) {
    if (!events.includes('createdb')) process.exit(23);
    record('synthetic-fixture');
    process.stdout.write('C08L_SYNTHETIC_FIXTURE_WIRING_ONLY\n');
  } else process.exit(24);
} else if (args[0] === 'rm') record('cleanup');
else process.exit(25);
`;

function withFakeDocker(mode: string, check: (output: { stdout: string; events: string[]; error?: Error }) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'myeongha-c08l-fake-docker-'));
  try {
    const file = join(dir, 'docker');
    const trace = join(dir, 'events.json');
    writeFileSync(file, fakeDocker);
    chmodSync(file, 0o755);
    const env = {
      ...process.env,
      PATH: dir + delimiter + (process.env.PATH ?? ''),
      C08L_FAKE_TRACE: trace,
      C08L_FAKE_MODE: mode,
    };
    let stdout = '';
    let error: Error | undefined;
    try {
      stdout = execFileSync(process.execPath, [runner, '--disposable-only'], {
        env, encoding: 'utf8', timeout: 25_000, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      error = err as Error;
      stdout = (err as { stdout?: Buffer }).stdout?.toString('utf8') ?? '';
    }
    const events = JSON.parse(readFileSync(trace, 'utf8')) as string[];
    check({ stdout, events, error });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('C08-L: Docker temporary postmaster to final PID1 race', () => {
  it('requires the final PID 1 and a successful SELECT, not pg_isready alone', () => {
    expect(script).toContain("'cat', '/proc/1/comm'");
    expect(script).toContain("processName === 'postgres'");
    expect(script).toContain("'select 1;'");
    expect(script).toContain("probe === '1'");
    expect(script).toContain('attempt < 90');
    expect(script).toContain('HOLD_C08_DOCKER_FINAL_POSTMASTER_NOT_READY');
    expect(script).toContain('C08_DOCKER_FINAL_POSTMASTER_READY');
    expect(script).not.toContain("name, 'pg_isready'");
  });

  it.skipIf(process.platform === 'win32')('never runs createdb against temporary postmaster or transient final startup', () => {
    withFakeDocker('success', ({ stdout, events, error }) => {
      expect(error).toBeUndefined();
      expect(stdout).toContain('C08_DOCKER_FINAL_POSTMASTER_READY');
      expect(stdout).toContain('C08_DOCKER_ISOLATED_PG17 170006');
      expect(stdout).toContain('PASS_C08_DOCKER_LOCAL_PG17_READONLY_CENSUS_SMOKE');
      expect(events).toEqual([
        'isolated-run',
        'pid1:docker-entrypoint',
        'pid1:docker-entrypoint',
        'pid1:postgres',
        'sql-probe:temporarily-unavailable',
        'pid1:postgres',
        'sql-probe:success',
        'createdb',
        'version',
        'synthetic-fixture',
        'cleanup',
      ]);
    });
  });

  it.skipIf(process.platform === 'win32')('fails closed and removes the container on createdb failure', () => {
    withFakeDocker('createdb-fails', ({ stdout, events, error }) => {
      expect(error).toBeDefined();
      expect(stdout).not.toContain('PASS_C08_DOCKER_LOCAL_PG17_READONLY_CENSUS_SMOKE');
      expect(events).toContain('createdb');
      expect(events).not.toContain('synthetic-fixture');
      expect(events.at(-1)).toBe('cleanup');
    });
  });
});
