import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const AUTH_URL = `${PRODUCTION_ORIGIN}/auth.html?next=records.html`;
const READINGS_URL = `${PRODUCTION_ORIGIN}/api/readings`;
const chromeBin = process.env.CHROME_BIN ?? process.env.CHROME_PATH;
const REQUEST_TIMEOUT_MS = 20_000;

function requireCredential(name, { trim = true } = {}) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.length === 0) throw new Error(`${name} is required.`);
  const value = trim ? raw.trim() : raw;
  if (value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const email = requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL');
const password = requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false });
assert(typeof chromeBin === 'string' && chromeBin.length > 0, 'CHROME_BIN is required.');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function devtoolsPort(profile, process) {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    assert(process.exitCode === null, `Chrome exited early (${process.exitCode}).`);
    try {
      const text = await import('node:fs/promises').then(({ readFile }) => readFile(join(profile, 'DevToolsActivePort'), 'utf8'));
      const [port] = text.trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await sleep(50);
  }
  throw new Error('Chrome DevTools port timeout.');
}

async function connectCdp(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, {
    method: 'PUT',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert(response.ok, `Chrome target creation failed with HTTP ${response.status}.`);
  const target = await response.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const runtimeExceptions = [];
  let readingsStatus = null;

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result ?? {});
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeExceptions.push(message.params?.exceptionDetails?.text ?? 'runtime exception');
      return;
    }
    if (message.method === 'Network.responseReceived') {
      const responseUrl = message.params?.response?.url;
      if (responseUrl === READINGS_URL) readingsStatus = message.params?.response?.status ?? null;
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { method, resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, `Runtime evaluation failed: ${result.exceptionDetails?.text ?? 'unknown'}.`);
    return result.result?.value;
  };

  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
  return {
    send,
    evaluate,
    getReadingsStatus: () => readingsStatus,
    getRuntimeExceptionCount: () => runtimeExceptions.length,
    close: () => ws.close(),
  };
}

async function waitFor(client, expression, message, timeout = REQUEST_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await sleep(100);
  }
  const diagnostics = await client.evaluate(`(() => ({
    hostname: location.hostname,
    pathname: location.pathname,
    recordsStatus: document.querySelector('#records-status')?.textContent?.trim() ?? null,
    recordsContentHidden: document.querySelector('#records-content')?.hidden ?? null,
    persistedCount: document.querySelectorAll('.records-reading-card--persisted').length,
    sampleCount: document.querySelectorAll('.records-reading-card--sample').length,
    emptyCount: document.querySelectorAll('.records-reading-empty').length,
  }))()`);
  throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}.`);
}

const profile = await mkdtemp(join(tmpdir(), 'myeongha-production-records-browser-'));
const chrome = spawn(chromeBin, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeError = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeError += chunk; });
let client;

try {
  client = await connectCdp(await devtoolsPort(profile, chrome));
  const navigation = await client.send('Page.navigate', { url: AUTH_URL });
  assert(!navigation.errorText, `Production auth navigation failed: ${navigation.errorText}.`);

  await waitFor(
    client,
    `document.readyState === 'complete' && location.hostname === 'myeongha.vercel.app' && location.pathname === '/auth.html' && Boolean(document.querySelector('#auth-form'))`,
    'Production auth form did not initialize',
  );

  await client.evaluate(`(() => {
    const email = document.querySelector('#auth-email');
    const password = document.querySelector('#auth-password');
    const form = document.querySelector('#auth-form');
    if (!email || !password || !form) throw new Error('Production auth controls missing.');
    email.value = ${JSON.stringify(email)};
    password.value = ${JSON.stringify(password)};
    form.requestSubmit();
  })()`);

  await waitFor(
    client,
    `location.hostname === 'myeongha.vercel.app' && location.pathname === '/records.html' && document.querySelector('#records-content')?.hidden === false`,
    'Production Member login did not reach Records',
  );

  await waitFor(client, `document.querySelector('#records-status')?.hidden === true`, 'Production Records did not reach ready state');
  await waitFor(client, `document.querySelectorAll('.records-reading-empty').length === 1`, 'Production Reading empty state was not rendered');

  const state = await client.evaluate(`(() => {
    const tab = document.querySelector('.records-tab[aria-controls="saju-records"]');
    tab?.click();
    const panel = document.querySelector('#saju-records');
    const empty = document.querySelector('.records-reading-empty');
    return {
      hostname: location.hostname,
      pathname: location.pathname,
      subjectKind: document.querySelector('#records-subject-kind')?.textContent?.trim() ?? null,
      panelHidden: panel?.hidden ?? null,
      persistedCount: document.querySelectorAll('.records-reading-card--persisted').length,
      sampleCount: document.querySelectorAll('.records-reading-card--sample').length,
      emptyCount: document.querySelectorAll('.records-reading-empty').length,
      emptyText: empty?.textContent?.trim() ?? '',
    };
  })()`);

  assert(state.hostname === 'myeongha.vercel.app', 'Production Records browser smoke escaped the canonical hostname.');
  assert(state.pathname === '/records.html', 'Production Records browser smoke escaped Records.');
  assert(state.subjectKind === '회원 기록', 'Production Records did not render Member authority.');
  assert(state.panelHidden === false, 'Production Saju Records panel was not visible after activation.');
  assert(state.persistedCount === 0, 'Production browser observed persisted Reading cards despite the zero-reading smoke account.');
  assert(state.sampleCount === 0, 'Production browser exposed a development Saju sample card.');
  assert(state.emptyCount === 1, 'Production browser did not render exactly one Reading empty state.');
  assert(state.emptyText.includes('아직 저장된 사주 풀이가 없습니다.'), 'Production browser rendered the wrong Reading empty-state copy.');
  assert(client.getReadingsStatus() === 200, `Production browser /api/readings expected HTTP 200, received ${client.getReadingsStatus()}.`);
  assert(client.getRuntimeExceptionCount() === 0, 'Production Records browser emitted a runtime exception.');

  console.log('MyeongHa production Records browser smoke passed: memberLogin=true, recordsReady=true, readings=200, persistedCards=0, developmentSampleCards=0, emptyState=visible.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Production Records browser smoke failed.');
  if (chrome.exitCode !== null && chromeError.trim()) console.error('Chrome exited before the smoke completed.');
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), sleep(1_000)]);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
