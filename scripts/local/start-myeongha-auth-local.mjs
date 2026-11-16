#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const localDir = resolve(root, 'scripts/local');
const composeFile = resolve(localDir, 'myeongha-auth-local.compose.yml');
const wranglerConfig = resolve(localDir, 'wrangler.local-auth.jsonc');
const devVars = resolve(localDir, '.dev.vars');
const projectName = 'myeongha-local-auth-' + randomBytes(6).toString('hex');
const requiredPorts = [8787, 15432, 15433, 15434];
const pinnedSajuPath = resolve(root, '..', 'MyeongHa-Saju-Pinned-Local');
const expectedSajuSha = '2bb797f0ca05775ccaaa36814c041ae4262ac872';
let sajuServer;
let wrangler;
let composeStarted = false;
let stopping = false;
const temp = await mkdtemp(join(tmpdir(), 'myeongha-local-auth-'));
const composeEnv = join(temp, 'compose.env');

function secret(size = 36) { return randomBytes(size).toString('base64url'); }
function localOAuthCredential(name) {
  const value = process.env[name]?.trim();
  return typeof value === 'string' && value.length <= 512 && /^[A-Za-z0-9._~-]+$/u.test(value)
    ? value : '';
}
function assertLocalDocker() {
  const remote = process.env.DOCKER_HOST;
  if (remote && !remote.startsWith('npipe://') && !remote.startsWith('unix://')) {
    throw new Error('Local Auth refuses a remote Docker daemon.');
  }
}
async function assertPortFree(port) {
  await new Promise((ok, fail) => {
    const server = createServer();
    server.once('error', () => fail(new Error(`Required local port ${port} is already in use.`)));
    server.listen(port, '127.0.0.1', () => server.close(error => error ? fail(error) : ok()));
  });
}
function runCompose(args, envFile = composeEnv) {
  return new Promise((ok, fail) => {
    const child = spawn('docker', ['compose', '--project-name', projectName, '--env-file', envFile,
      '-f', composeFile, ...args.split(/\s+/u)], {
      cwd: root, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(new Error(`Disposable local Auth container command failed (${code}).`)));
  });
}
function wranglerEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('MYEONGHA_') || key.startsWith('SAJU_BRIDGE_LOCAL_')) delete env[key];
  }
  return env;
}
async function startWrangler() {
  await new Promise((ok, fail) => {
    const cmd = `npx --yes wrangler@4.162.0 dev --config scripts/local/wrangler.local-auth.jsonc --ip 127.0.0.1 --port 8787 --persist-to scripts/local/.wrangler/${projectName}`;
    wrangler = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmd], {
      cwd: root, env: wranglerEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    const onReady = data => {
      const line = data.toString();
      process.stdout.write(line);
      output = (output + line).slice(-6000);
      if (/Ready on http:\/\/127\.0\.0\.1:8787|Ready on https:\/\/127\.0\.0\.1:8787/iu.test(output)) {
        wrangler.stdout.off('data', onReady);
        ok();
      }
    };
    wrangler.stdout.on('data', onReady);
    wrangler.stderr.on('data', data => process.stderr.write(data));
    wrangler.once('error', fail);
    wrangler.once('exit', code => fail(new Error(`Local Worker exited before readiness (${code}).`)));
    setTimeout(() => fail(new Error('Local Worker did not become ready within 90 seconds.')), 90_000).unref();
  });
}
async function startPinnedSajuService(bearer) {
  const engineFile = resolve(pinnedSajuPath, 'dist', 'production-calculation-process.js');
  if (!(await access(engineFile).then(() => true, () => false))) {
    console.warn('Pinned local Saju engine not installed; starting Auth-only local server.');
    return false;
  }
  const sha = execFileSync('git', ['-C', pinnedSajuPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['-C', pinnedSajuPath, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  if (sha !== expectedSajuSha || dirty) throw new Error('Local Saju engine is not the clean approved pinned revision.');
  const { createMyeonghwaProductionCalculationProcessV1 } = await import(pathToFileURL(engineFile).href);
  sajuServer = createMyeonghwaProductionCalculationProcessV1({
    SAJU_PRODUCTION_SERVICE_BEARER: bearer, SAJU_PRODUCTION_HOST: '127.0.0.1', PORT: '15434',
  }).server;
  await new Promise((ok, fail) => {
    sajuServer.once('error', fail);
    sajuServer.listen(15434, '127.0.0.1', ok);
  });
  return true;
}
async function waitForWeb() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:8787/auth.html', { signal: AbortSignal.timeout(1500) });
      if (response.status === 200) return;
      await response.body?.cancel();
    } catch { /* Worker asset binding is still starting. */ }
    await delay(500);
  }
  throw new Error('Local MyeongHa website did not answer at 127.0.0.1:8787.');
}
async function cleanup() {
  if (stopping) return;
  stopping = true;
  if (sajuServer) {
    sajuServer.closeAllConnections();
    await new Promise(resolveClose => sajuServer.close(resolveClose));
  }
  if (wrangler?.pid && process.platform === 'win32') {
    await new Promise(resolveKill => {
      const killer = spawn('taskkill.exe', ['/PID', String(wrangler.pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true,
      });
      killer.once('error', resolveKill);
      killer.once('exit', resolveKill);
    });
  } else {
    wrangler?.kill('SIGTERM');
  }
  if (composeStarted) {
    try { await runCompose('down --volumes --remove-orphans'); }
    catch { console.error('Local Auth cleanup failed; only remove Docker project ' + projectName + '.'); }
  }
  await Promise.allSettled([
    rm(devVars, { force: true }),
    rm(temp, { recursive: true, force: true }),
    rm(resolve(localDir, '.wrangler', projectName), { recursive: true, force: true }),
  ]);
}

try {
  assertLocalDocker();
  await access(composeFile);
  await access(wranglerConfig);
  try { await access(devVars); throw new Error('A local .dev.vars file already exists; refusing to overwrite it.'); }
  catch (error) { if (error.message.includes('refusing')) throw error; }
  for (const port of requiredPorts) await assertPortFree(port);

  const authDbPassword = secret();
  const subjectDbPassword = secret();
  const subjectLoginPassword = secret();
  const identitySyncPassword = secret();
  const jwtSecret = randomBytes(48).toString('hex');
  const authApiKey = 'sb_publishable_local_' + secret(20);
  const fingerprintSecret = secret(48);
  const rateLimitSecret = secret(48);
  const googleClientId = localOAuthCredential('MYEONGHA_LOCAL_GOOGLE_CLIENT_ID');
  const googleClientSecret = localOAuthCredential('MYEONGHA_LOCAL_GOOGLE_CLIENT_SECRET');
  const kakaoClientId = localOAuthCredential('MYEONGHA_LOCAL_KAKAO_CLIENT_ID');
  const kakaoClientSecret = localOAuthCredential('MYEONGHA_LOCAL_KAKAO_CLIENT_SECRET');
  const googleEnabled = googleClientId !== '' && googleClientSecret !== '';
  const kakaoEnabled = kakaoClientId !== '' && kakaoClientSecret !== '';
  const composeValues = {
    LOCAL_AUTH_DB_PASSWORD: authDbPassword,
    LOCAL_SUBJECT_DB_PASSWORD: subjectDbPassword,
    LOCAL_SUBJECT_LOGIN_PASSWORD: subjectLoginPassword,
    LOCAL_IDENTITY_SYNC_PASSWORD: identitySyncPassword,
    LOCAL_JWT_SECRET: jwtSecret,
    LOCAL_GOOGLE_ENABLED: String(googleEnabled),
    LOCAL_GOOGLE_CLIENT_ID: googleClientId,
    LOCAL_GOOGLE_CLIENT_SECRET: googleClientSecret,
    LOCAL_KAKAO_ENABLED: String(kakaoEnabled),
    LOCAL_KAKAO_CLIENT_ID: kakaoClientId,
    LOCAL_KAKAO_CLIENT_SECRET: kakaoClientSecret,
  };
  await writeFile(composeEnv, Object.entries(composeValues).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  composeStarted = true;
  await runCompose('up --detach --wait --wait-timeout 240');
  await runCompose('wait bootstrap-subject');
  const sajuBearer = secret(48);
  const sajuAvailable = await startPinnedSajuService(sajuBearer);

  const vars = {
    MYEONGHA_LOCAL_AUTH_MODE: 'isolated-v1',
    MYEONGHA_LOCAL_AUTH_PROJECT_NAME: projectName,
    MYEONGHA_LOCAL_AUTH_COMPOSE_ENV_FILE: composeEnv,
    MYEONGHA_LOCAL_AUTH_ORIGIN: 'http://127.0.0.1:8787',
    MYEONGHA_LOCAL_SUPABASE_URL: 'http://127.0.0.1:15432',
    MYEONGHA_LOCAL_SUPABASE_BROWSER_URL: 'http://127.0.0.1:15432',
    MYEONGHA_LOCAL_SUPABASE_API_KEY: authApiKey,
    MYEONGHA_LOCAL_DATABASE_URL: `postgres://myeongha_runtime:${subjectLoginPassword}@127.0.0.1:15433/myeongha_saju_subject_local_verify?sslmode=disable`,
    MYEONGHA_LOCAL_IDENTITY_SYNC_DATABASE_URL: `postgres://myeongha_local_auth_sync:${identitySyncPassword}@127.0.0.1:15433/myeongha_saju_subject_local_verify?sslmode=disable`,
    MYEONGHA_LOCAL_GUEST_FINGERPRINT_SECRET: fingerprintSecret,
    MYEONGHA_LOCAL_BIRTH_INPUT_HMAC_K1_SECRET: secret(48),
    ...(sajuAvailable ? {
      MYEONGHA_LOCAL_SAJU_SERVICE_ORIGIN: 'http://127.0.0.1:15434',
      MYEONGHA_LOCAL_SAJU_SERVICE_BEARER: sajuBearer,
    } : {}),
    MYEONGHA_LOCAL_AUTH_RATE_LIMIT_SECRET: rateLimitSecret,
    MYEONGHA_AUTH_RATE_LIMIT_SECRET: rateLimitSecret,
    MYEONGHA_LOCAL_GUEST_SESSION_TTL_SECONDS: '86400',
    MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED: String(googleEnabled),
    MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED: String(kakaoEnabled),
    MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED: 'false',
  };
  await writeFile(devVars, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  await startWrangler();
  vars.MYEONGHA_LOCAL_AUTH_WRANGLER_PID = String(wrangler.pid);
  await writeFile(devVars, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  await waitForWeb();
  console.log('\nIsolated local MyeongHa Auth is ready at http://127.0.0.1:8787/auth.html');
  console.log('Guest/session data and Auth users are disposable local Docker data only.');
  console.log('Press Ctrl+C to stop the Worker and remove both databases and generated credentials.');
  await new Promise(resolveStop => {
    process.once('SIGINT', resolveStop);
    process.once('SIGTERM', resolveStop);
    wrangler.once('exit', resolveStop);
  });
} catch (error) {
  console.error('Local Auth startup failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
} finally {
  await cleanup();
}
