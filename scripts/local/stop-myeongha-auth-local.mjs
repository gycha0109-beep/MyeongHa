#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const localDir = resolve(root, 'scripts/local');
const devVars = resolve(localDir, '.dev.vars');
const composeFile = resolve(localDir, 'myeongha-auth-local.compose.yml');

function parseVars(text) {
  return Object.fromEntries(text.split(/\r?\n/u).filter(Boolean).map(line => {
    const index = line.indexOf('=');
    return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : ['', ''];
  }).filter(([key]) => key));
}

function run(file, args, { allowNonZero = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(file, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', rejectRun);
    child.once('exit', code => {
      if (code === 0 || allowNonZero) resolveRun();
      else rejectRun(new Error(`${basename(file)} failed while stopping isolated local Auth (${code}).`));
    });
  });
}

try {
  const vars = parseVars(await readFile(devVars, 'utf8'));
  if (vars.MYEONGHA_LOCAL_AUTH_MODE !== 'isolated-v1' ||
      !/^myeongha-local-auth-[a-f0-9]{12}$/u.test(vars.MYEONGHA_LOCAL_AUTH_PROJECT_NAME ?? '')) {
    throw new Error('No recognized isolated local Auth run is active.');
  }
  const envFile = resolve(vars.MYEONGHA_LOCAL_AUTH_COMPOSE_ENV_FILE ?? '');
  const allowedTempRoot = resolve(tmpdir());
  const envParent = dirname(envFile);
  if (dirname(envParent) !== allowedTempRoot || basename(envParent).startsWith('myeongha-local-auth-') !== true ||
      basename(envFile) !== 'compose.env') {
    throw new Error('The recorded local Auth cleanup path is outside its temporary directory.');
  }

  const pid = vars.MYEONGHA_LOCAL_AUTH_WRANGLER_PID;
  if (/^[1-9][0-9]*$/u.test(pid ?? '') && process.platform === 'win32') {
    await run('taskkill.exe', ['/PID', pid, '/T', '/F'], { allowNonZero: true });
  }
  await run('docker', ['compose', '--project-name', vars.MYEONGHA_LOCAL_AUTH_PROJECT_NAME,
    '--env-file', envFile, '-f', composeFile, 'down', '--volumes', '--remove-orphans']);
  const wranglerState = resolve(localDir, '.wrangler', vars.MYEONGHA_LOCAL_AUTH_PROJECT_NAME);
  await rm(devVars, { force: true });
  await rm(envParent, { recursive: true, force: true });
  await rm(wranglerState, { recursive: true, force: true });
  console.log('Stopped the isolated local Auth Worker and removed its disposable databases and generated credentials.');
} catch (error) {
  console.error('Local Auth stop failed:', error instanceof Error ? error.message : 'unknown failure');
  process.exitCode = 1;
}
