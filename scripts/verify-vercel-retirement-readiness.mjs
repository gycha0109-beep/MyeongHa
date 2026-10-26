// Read-only release gate for retiring the Vercel standby. No credentials,
// POSTs, deployments, DNS updates, or private response bodies are allowed.
// Watchtower-Track: ops
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

export const CLOUDFLARE_ORIGIN = 'https://myeongha.gycha0109.workers.dev';
export const VERCEL_ORIGIN = 'https://myeongha.vercel.app';
export const RETIREMENT_EVIDENCE = Object.freeze([
  'approvedPublicOrigin',
  'oauthCallbackE2E',
  'memberDatabaseTlsRlsE2E',
  'guestMemberContinuityE2E',
  'sajuCalculationE2E',
  'protectedAiCommerceHolds',
  'productionSecretParity',
  'exactShaAndWorkerVersion',
  'fullPreviewCiAcceptance',
  'rollbackRehearsal',
  'cutoverStabilityObservation',
  'explicitFinalShutdownApproval',
]);
const STATIC_PAGES = Object.freeze([
  '/', '/index.html', '/auth.html', '/birth.html', '/chat.html',
  '/chat-hub.html', '/face-reading.html', '/hall.html', '/my.html',
  '/reading-detail.html', '/reading.html', '/records.html',
]);
const VERSION_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const MAX_JSON_BYTES = 8192;
const STATUS_VALUES = new Set(['ready', 'degraded', 'unready']);

export function approvedRetirementPublicOriginV1(candidate) {
  if (typeof candidate !== 'string' || candidate.length > 253) return null;
  let url;
  try { url = new URL(candidate); } catch { return null; }
  if (url.protocol !== 'https:' || url.origin !== candidate ||
      url.username || url.password || url.port || url.pathname !== '/' ||
      url.search || url.hash) return null;
  // The already-approved canonical Worker is also a valid permanent public origin.
  if (candidate === CLOUDFLARE_ORIGIN) return candidate;
  const hostname = url.hostname;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/u.test(hostname) ||
      hostname === 'myeongha.vercel.app' ||
      /\.(?:vercel\.app|workers\.dev|localhost|local|internal|invalid|test|example)$/u.test(hostname) ||
      ['example.com', 'example.net', 'example.org'].some(
        reserved => hostname === reserved || hostname.endsWith('.' + reserved),
      )) return null;
  return candidate;
}

function probeStatus(response) {
  return Number.isInteger(response?.status) ? response.status : 0;
}
function getHeader(response, key) {
  return response?.headers?.get(key) ?? null;
}
function addBlock(blocked, code, condition) {
  if (condition) blocked.push(code);
}
function validCapabilities(report) {
  return report !== null && typeof report === 'object' && !Array.isArray(report) &&
    STATUS_VALUES.has(report.status) && report.capabilities !== null &&
    typeof report.capabilities === 'object' && !Array.isArray(report.capabilities);
}
function summarizeReadiness(response, report) {
  return Object.freeze({
    http: probeStatus(response),
    status: validCapabilities(report) ? report.status : 'invalid',
    userData: validCapabilities(report) &&
      STATUS_VALUES.has(report.capabilities.userData)
      ? report.capabilities.userData : 'invalid',
    sajuCalculation: validCapabilities(report) &&
      STATUS_VALUES.has(report.capabilities.sajuCalculation)
      ? report.capabilities.sajuCalculation : 'invalid',
  });
}

export function parseVercelRetirementEvidenceV1(document) {
  if (document?.schemaVersion !== 'myeongha-vercel-retirement-evidence-v1' ||
      !VERSION_PATTERN.test(document?.workerVersion ?? '') ||
      approvedRetirementPublicOriginV1(document?.publicOrigin) === null ||
      !/^[a-f0-9]{40}$/iu.test(document?.gitSha ?? '') ||
      document?.checks === null || typeof document?.checks !== 'object' ||
      Array.isArray(document?.checks)) throw Error('Invalid retirement evidence identity');
  const checks = {};
  for (const name of RETIREMENT_EVIDENCE) {
    const row = document.checks[name];
    checks[name] = row?.passed === true && typeof row?.evidenceRef === 'string' &&
      /^https:\/\/github\.com\/gycha0109-beep\/MyeongHa\/(?:actions\/runs\/[0-9]+|pull\/[0-9]+(?:\/checks)?|blob\/[a-f0-9]{40}\/[a-zA-Z0-9_.\/-]+)$/u.test(row.evidenceRef);
  }
  return Object.freeze({ ...checks, evidenceWorkerVersion: document.workerVersion,
    publicOrigin: document.publicOrigin });
}

export function evaluateVercelRetirementV1(snapshot, evidence = {}) {
  const blocked = [];
  addBlock(blocked, 'VERCEL_STANDBY_NOT_HEALTHY',
    snapshot.vercel.health !== 200 || snapshot.vercel.ready.http !== 200);
  addBlock(blocked, 'CLOUDFLARE_HEALTH_UNAVAILABLE', snapshot.cloudflare.health !== 200);
  addBlock(blocked, 'CLOUDFLARE_USER_DATA_NOT_READY',
    snapshot.cloudflare.ready.http !== 200 ||
    snapshot.cloudflare.ready.status !== 'ready' ||
    snapshot.cloudflare.ready.userData !== 'ready');
  addBlock(blocked, 'CLOUDFLARE_SAJU_NOT_READY',
    snapshot.cloudflare.ready.http !== 200 ||
    snapshot.cloudflare.ready.sajuCalculation !== 'ready');
  addBlock(blocked, 'WORKER_VERSION_UNPINNED',
    !VERSION_PATTERN.test(snapshot.cloudflare.version ?? '') ||
    snapshot.cloudflare.version !== snapshot.cloudflare.confirmationVersion);
  addBlock(blocked, 'EVIDENCE_VERSION_DRIFT',
    typeof evidence.evidenceWorkerVersion === 'string' &&
    evidence.evidenceWorkerVersion !== snapshot.cloudflare.version);
  const publicOrigin = approvedRetirementPublicOriginV1(evidence.publicOrigin);
  const livePublic = snapshot.public;
  addBlock(blocked, 'PUBLIC_ORIGIN_NOT_VERIFIED',
    publicOrigin === null || livePublic?.origin !== publicOrigin ||
    livePublic?.health !== 200 || livePublic?.ready?.http !== 200 ||
    livePublic?.ready?.status !== 'ready' ||
    livePublic?.ready?.userData !== 'ready' ||
    livePublic?.ready?.sajuCalculation !== 'ready');
  if (publicOrigin !== null) addBlock(blocked, 'PUBLIC_ORIGIN_WORKER_VERSION_MISMATCH',
    livePublic?.version !== snapshot.cloudflare.version ||
    livePublic?.confirmationVersion !== snapshot.cloudflare.confirmationVersion);
  for (const path of STATIC_PAGES) {
    addBlock(blocked, 'STATIC_ROUTE_NOT_READY:' + path,
      snapshot.cloudflare.static[path] !== 200 ||
      snapshot.vercel.static[path] !== 200);
    if (publicOrigin !== null) addBlock(blocked, 'CUSTOM_DOMAIN_STATIC_NOT_READY:' + path,
      livePublic?.static?.[path] !== 200);
  }
  // These are independent operational acceptance records, never inferred
  // from a 200 health check or user-supplied "all good" text.
  for (const name of RETIREMENT_EVIDENCE) {
    addBlock(blocked, 'MISSING_EVIDENCE:' + name, evidence[name] !== true);
  }
  return Object.freeze({
    result: blocked.length === 0 ? 'ELIGIBLE_FOR_MANUAL_RETIREMENT' : 'HOLD',
    shutdownExecuted: false,
    cloudflareVersion: VERSION_PATTERN.test(snapshot.cloudflare.version ?? '')
      ? snapshot.cloudflare.version : null,
    vercelReadiness: snapshot.vercel.ready,
    cloudflareReadiness: snapshot.cloudflare.ready,
    publicDomainReadiness: livePublic?.ready ?? null,
    blocked,
  });
}

async function readBoundedJson(response) {
  if (probeStatus(response) !== 200 && probeStatus(response) !== 503) return null;
  if (!(getHeader(response, 'content-type') ?? '').toLowerCase()
    .includes('application/json')) return null;
  const length = Number(getHeader(response, 'content-length') ?? 0);
  if (!Number.isFinite(length) || length > MAX_JSON_BYTES) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  let total = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BYTES) return null;
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return null; }
  } finally { try { await reader.cancel(); } catch { /* consumed */ } }
}

export async function runVercelRetirementAuditV1({ fetchImpl = fetch, evidence = {} } = {}) {
  async function request(origin, path, method = 'GET') {
    const response = await fetchImpl(origin + path, {
      method, redirect: 'error', credentials: 'omit', cache: 'no-store',
      signal: AbortSignal.timeout(10000),
      headers: { Accept: method === 'HEAD' ? 'text/html' : 'application/json' },
    });
    if (!(response instanceof Response)) throw Error('Invalid HTTP response');
    return response;
  }
  const publicOrigin = approvedRetirementPublicOriginV1(evidence.publicOrigin);
  const cfStatic = {};
  const vercelStatic = {};
  const publicStatic = {};
  for (const path of STATIC_PAGES) {
    cfStatic[path] = probeStatus(await request(CLOUDFLARE_ORIGIN, path, 'HEAD'));
    vercelStatic[path] = probeStatus(await request(VERCEL_ORIGIN, path, 'HEAD'));
    if (publicOrigin !== null) {
      publicStatic[path] = probeStatus(await request(publicOrigin, path, 'HEAD'));
    }
  }
  const cfHealth = await request(CLOUDFLARE_ORIGIN, '/api/health');
  const workerVersion = getHeader(cfHealth, 'x-myeongha-worker-version');
  const cfReadiness = await request(CLOUDFLARE_ORIGIN, '/api/readiness');
  const cfReady = summarizeReadiness(cfReadiness, await readBoundedJson(cfReadiness));
  const vercelHealth = await request(VERCEL_ORIGIN, '/api/health');
  const vercelReadiness = await request(VERCEL_ORIGIN, '/api/readiness');
  const vercelReady = summarizeReadiness(vercelReadiness,
    await readBoundedJson(vercelReadiness));
  // Another track can deploy between checks; never use an inconsistent version
  // as a Vercel shutdown signal.
  const cfConfirmation = await request(CLOUDFLARE_ORIGIN, '/api/health');
  // A custom domain is a distinct runtime origin. Test its actual /api/*
  // Worker identity and readiness rather than trusting a file-level flag.
  let publicSnapshot = null;
  if (publicOrigin !== null) {
    const publicHealth = await request(publicOrigin, '/api/health');
    const publicReadiness = await request(publicOrigin, '/api/readiness');
    const ready = summarizeReadiness(publicReadiness,
      await readBoundedJson(publicReadiness));
    const confirm = await request(publicOrigin, '/api/health');
    publicSnapshot = {
      origin: publicOrigin, health: probeStatus(publicHealth), ready,
      version: getHeader(publicHealth, 'x-myeongha-worker-version'),
      confirmationVersion: getHeader(confirm, 'x-myeongha-worker-version'),
      static: publicStatic,
    };
  }
  return evaluateVercelRetirementV1({
    cloudflare: {
      health: probeStatus(cfHealth),
      ready: cfReady, static: cfStatic,
      version: workerVersion,
      confirmationVersion: getHeader(cfConfirmation, 'x-myeongha-worker-version'),
    },
    vercel: { health: probeStatus(vercelHealth), ready: vercelReady, static: vercelStatic },
    public: publicSnapshot,
  }, evidence);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const evidenceIndex = args.indexOf('--evidence');
    if (evidenceIndex !== -1 && !args[evidenceIndex + 1]) throw Error('Missing evidence path');
    const evidence = evidenceIndex === -1 ? {} : parseVercelRetirementEvidenceV1(
      JSON.parse(await readFile(args[evidenceIndex + 1], 'utf8')),
    );
    const result = await runVercelRetirementAuditV1({ evidence });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (process.argv.includes('--require-ready') && result.result !== 'ELIGIBLE_FOR_MANUAL_RETIREMENT') {
      process.exitCode = 2;
    }
  } catch {
    process.stdout.write(JSON.stringify({ result: 'HOLD', shutdownExecuted: false,
      blocked: ['READ_ONLY_AUDIT_FAILED'] }) + '\n');
    process.exitCode = 2;
  }
}
