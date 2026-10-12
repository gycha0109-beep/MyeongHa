#!/usr/bin/env node
// Regression: an unavailable/Windows-mode Docker Engine must fail before Compose.
// Exercises the real local launcher using a mocked Docker CLI (no Docker needed).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./verify-saju-bridge-docker-local.mjs', import.meta.url));
if (process.platform === 'win32') {
  console.log('[saju-bridge] Mock preflight regression runs on Linux CI; native Windows Docker remains an external smoke check.');
  process.exit(0);
}

function simulate(engineReply, engineExit = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'saju-docker-preflight-'));
  try {
    const log = join(dir, 'commands.txt');
    const dockerStub = join(dir, 'docker');
    writeFileSync(dockerStub, `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
if [ "$1" = context ]; then
  printf '%s\\n' 'npipe:////./pipe/docker_engine'
  exit 0
fi
if [ "$1" = compose ] && [ "$2" = version ]; then
  printf '%s\\n' 'Docker Compose version v2'
  exit 0
fi
if [ "$1" = info ]; then
  printf '%s\\n' ${JSON.stringify(engineReply)}
  exit ${engineExit}
fi
echo 'Unexpected Docker command' >&2
exit 99
`);
    chmodSync(dockerStub, 0o755);
    const result = spawnSync(process.execPath, [runner], {
      env: {
        ...process.env,
        PATH: dir + delimiter + process.env.PATH,
        DOCKER_HOST: '',
        DOCKER_CONTEXT: '',
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    const invoked = readFileSync(log, 'utf8');
    assert.equal(result.status, 1, 'Engine errors must produce exit 1');
    assert.doesNotMatch(invoked, /compose --project-name|\bup\b|\bdown\b|\bconfig\b/,
      'Engine error must not start the Compose resource lifecycle or cleanup');
    assert.doesNotMatch(result.stderr, /CLEANUP BLOCKED/,
      'No cleanup failure may be reported before any test resources are created');
    assert.doesNotMatch(result.stdout, /Disposable Docker project:/);
    return result.stderr;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const offline = simulate('Cannot connect to the Docker daemon', 1);
assert.match(offline, /Docker Engine is unreachable/);
const windowsContainers = simulate('windows');
assert.match(windowsContainers, /Linux Docker Engine is required/);
console.log('[saju-bridge] Offline/Windows Engine preflight rejects before Compose: PASS.');
