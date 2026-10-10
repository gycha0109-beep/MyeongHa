#!/usr/bin/env node
// Run the already-approved synthetic Permit V2 DB checks on disposable
// PostgreSQL 15 and 17, entirely inside a private Docker network.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const composeFile = fileURLToPath(new URL('./saju-bridge-db.compose.yml', import.meta.url));
const project = `myeongha-saju-local-${randomBytes(5).toString('hex')}`;

function docker(args) {
  const result = spawnSync('docker', args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, COMPOSE_IGNORE_ORPHANS: 'false' },
  });
  if (result.error) throw new Error(`Docker command could not start: ${result.error.code ?? 'UNKNOWN'}`);
  if (result.status !== 0) throw new Error(`Docker command failed: ${result.status ?? result.signal ?? 'UNKNOWN'}`);
}

if (process.argv.length !== 2) {
  console.error('No arguments are supported. This runner never accepts a target or connection URL.');
  process.exitCode = 2;
} else {
  try {
    docker(['compose', 'version']);
    // Do not inherit any explicitly configured remote daemon or nonlocal context.
    // These tests must never be redirected to a cloud Docker host.
    const daemon = process.env.DOCKER_HOST;
    const context = process.env.DOCKER_CONTEXT;
    if ((daemon && !daemon.startsWith('unix://') && !daemon.startsWith('npipe://'))
      || (context && !['default', 'desktop-linux'].includes(context))) {
      throw new Error('Refusing a nonlocal Docker daemon or context.');
    }

    const base = ['compose', '--project-name', project, '-f', composeFile];
    try {
      console.log('[saju-bridge] Disposable PostgreSQL 15 / Permit V2');
      docker([...base, 'run', '--rm', 'check15']);
      console.log('[saju-bridge] Disposable PostgreSQL 17 / Permit V2');
      docker([...base, 'run', '--rm', 'check17']);
      console.log('[saju-bridge] Local isolated DB authority checks: PASS');
      console.log('[saju-bridge] This is NOT operational staging admission or live Saju proof.');
    } finally {
      try {
        docker([...base, 'down', '--volumes', '--remove-orphans']);
      } catch {
        console.error('[saju-bridge] Cleanup failed. Inspect the isolated Docker project and remove it manually.');
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(`[saju-bridge] BLOCKED: ${error instanceof Error ? error.message : 'unknown failure'}`);
    process.exitCode = 1;
  }
}
