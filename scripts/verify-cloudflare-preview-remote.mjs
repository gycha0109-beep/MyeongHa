// Verify the deployed, public Cloudflare Preview from GitHub Actions.
// Read-only synthetic requests; never touch a user account or production origin.
// Watchtower-Track: ops
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';
import {
  CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1,
  CLOUDFLARE_PREVIEW_RECEIPT_SCHEMA_V1,
} from './prepare-cloudflare-static.mjs';
import { CLOUDFLARE_DIRECT_API_ROUTES, CLOUDFLARE_REWRITE_ROUTES } from '../workers/cloudflare-api-router.mjs';
import { summarizeCloudflarePreviewProbeMetricsV1 } from './cloudflare-preview-smoke-metrics.mjs';
import { assessCloudflarePreviewOpsStopGateV1 } from './cloudflare-preview-ops-stop-gate.mjs';

const URL_FROM_CLOUDFLARE = 'https://feat-ops-cloudflare-static-preview-20261020-myeongha.gycha0109.workers.dev';
const origin = process.env.MYEONGHA_CLOUDFLARE_PREVIEW_URL || URL_FROM_CLOUDFLARE;
const contract = process.env.MYEONGHA_CLOUDFLARE_SMOKE_CONTRACT || 'stage4-legacy';
if (!['stage4-legacy', 'scf2-stage5'].includes(contract)) throw Error('Unrecognized Cloudflare Preview smoke contract.');
const scf2 = contract === 'scf2-stage5';
const expectedHead = process.env.MYEONGHA_CLOUDFLARE_EXPECTED_HEAD;
if (scf2 && (typeof expectedHead !== 'string' || !/^[a-f0-9]{40}$/.test(expectedHead))) {
  throw Error('S-CF2 Preview requires the exact GitHub PR head SHA.');
}
const parsed = new URL(origin);
if (
  parsed.protocol !== 'https:' ||
  !parsed.hostname.endsWith('.workers.dev') ||
  parsed.username || parsed.password || parsed.pathname !== '/' ||
  parsed.search || parsed.hash
) throw Error('Preview origin must be an exact HTTPS workers.dev origin (no path/query).');

const assert = (condition, reason) => { if (!condition) throw Error(reason); };
const vercel = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
const baseline = new Map(vercel.headers?.[0]?.headers?.map(({key,value})=>[key.toLowerCase(),value]) || []);
const expected = ['content-security-policy','referrer-policy','x-content-type-options','x-frame-options','x-robots-tag'];
assert(baseline.size === expected.length && expected.every(h=>baseline.has(h)), 'Vercel baseline changed');

const failures = [];
const timingSamples = [];
let requests = 0;
async function check(path, status, options = {}) {
  const target = new URL(path, parsed);
  assert(target.origin === parsed.origin, 'Cross-origin test prohibited');
  const request = {...options, redirect:'manual', signal:AbortSignal.timeout(15_000)};
  let response;
  const started = performance.now();
  try {
    response = await fetch(target, request);
    requests++;
    timingSamples.push({path,expectedStatus:status,
      actualStatus:response.status,elapsedMs:performance.now()-started});
  } catch (error) {
    timingSamples.push({path,expectedStatus:status,
      actualStatus:null,elapsedMs:performance.now()-started});
    failures.push({method:request.method ?? 'GET',path,reason:'transport',message:String(error)});
    return null;
  }
  if (response.status !== status) failures.push({path,reason:'http-status',expected:status,actual:response.status});
  for (const key of expected) {
    const actual = response.headers.get(key);
    // Cloudflare adds/replaces X-Robots-Tag with exactly "noindex" on
    // Workers.dev Preview URLs (documented platform behavior).
    // Keep the Vercel baseline exact on every other security header;
    // never accept a missing indexing restriction.
    const previewManagedRobots = key === 'x-robots-tag' && actual === 'noindex';
    if (actual !== baseline.get(key) && !previewManagedRobots) failures.push({
      path,reason:'security-header',header:key,expected:baseline.get(key),actual,
    });
  }
  if (response.headers.has('set-cookie')) failures.push({path,reason:'unexpected-cookie'});
  if (response.headers.has('location')) failures.push({path,reason:'unexpected-redirect',location:response.headers.get('location')});
  const cache = response.headers.get('cache-control') || '';
  if (!cache.includes('no-store')) failures.push({path,reason:'cache-must-not-store',actual:cache});
  return response;
}

async function waitForHealthDeployment() {
  // Cloudflare preview deployments lag PR events. Never accidentally test a
  // previous version of the deny-only Worker for a new health contract.
  const maxWaitMs = 240_000;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/health',parsed), {
        redirect:'manual',
        signal:AbortSignal.timeout(10_000),
      });
      if (response.status === 200 &&
        (await response.json().catch(()=>null))?.status === 'ok') return;
      if (response.status !== 404 && response.status !== 200) {
        throw Error('Unexpected preview health status before deployment: '+response.status);
      }
    } catch (error) {
      // Only retry transport startup and timeout. Unexpected responses
      // eventually fail with an explicit deadline, not a silent PASS.
      console.log('Waiting for Cloudflare preview health:',String(error).slice(0,120));
    }
    await new Promise(done=>setTimeout(done,6_000));
  }
  throw Error('Cloudflare Preview GET /api/health never became ready within '+maxWaitMs+'ms');
}

async function waitForExactPreviewBuild() {
  if (!scf2) return; // Preserve the existing PR #2384 Stage 4 contract.
  const receiptUrl = new URL('/' + CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1, parsed);
  const deadline = Date.now() + 420_000;
  let latest = 'not deployed';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(receiptUrl, {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 200 &&
          response.headers.get('content-type')?.includes('application/json') &&
          response.headers.get('cache-control')?.includes('no-store') &&
          !response.headers.has('set-cookie') && !response.headers.has('location')) {
        const text = await response.text();
        const receipt = JSON.parse(text);
        if (receipt?.schema === CLOUDFLARE_PREVIEW_RECEIPT_SCHEMA_V1 &&
            receipt?.commit === expectedHead) {
          console.log('Cloudflare Preview exact-commit asset receipt:', receipt.commit);
          return receipt.commit;
        }
        latest = typeof receipt?.commit === 'string' && /^[a-f0-9]{40}$/.test(receipt.commit)
          ? receipt.commit : 'malformed';
      } else {
        latest = 'HTTP ' + response.status;
      }
    } catch {
      latest = 'transport/unreadable';
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
  throw Error('Cloudflare Preview did not deploy exact expected commit; expected=' +
    expectedHead + ', observed=' + latest);
}

async function main() {
  await waitForHealthDeployment();
  const attestedCommit = await waitForExactPreviewBuild();
  let response = await check('/',200);
  if (response) {
    const text = await response.text();
    if (!/<html[\s>]/i.test(text)) failures.push({path:'/',reason:'root-not-html'});
  }
  for (const page of HTML_ENTRIES) {
    response = await check('/'+page,200);
    if (!response) continue;
    if (!response.headers.get('content-type')?.includes('text/html')) failures.push({path:page,reason:'html-mime'});
    const text = await response.text();
    if (!/<html[\s>]/i.test(text) || !text.includes('</html>')) failures.push({path:page,reason:'invalid-html'});
  }
  response = await check('/api/health',200);
  if (response) {
    const json = await response.json().catch(()=>null);
    if (JSON.stringify(json) !== '{"status":"ok"}') failures.push({path:'/api/health',reason:'liveness-contract',actual:json});
  }
  for (const method of ['POST','OPTIONS','HEAD']) {
    response = await check('/api/health',405,{ method });
    if (response && response.headers.get('allow') !== 'GET') {
      failures.push({path:'/api/health',method,reason:'allow-get-contract'});
    }
    if (response && response.headers.has('access-control-allow-origin')) {
      failures.push({path:'/api/health',method,reason:'unexpected-cors'});
    }
  }
  for (const path of ['/missing-page.html','/api','/api/readiness','/api/readings','/api/me',
      '/api/unknown','/api/health?__myeongha_chat_open=1']) {
    response = await check(path,404);
    if (!response) continue;
    if ((await response.text()).trim() !== '') failures.push({path,reason:'deny-body-not-empty'});
  }
  // Every non-health Vercel endpoint remains deny-only. On S-CF2 the
  // protected Chat routes deliberately return 503, not the legacy 404.
  // Never read a protected body as a success or confuse this with Reveal.
  for (const route of CLOUDFLARE_DIRECT_API_ROUTES.filter(x=>x.id!=='api.health')) {
    response = await check(route.path,404);
    if (response && (await response.text()).trim() !== '') {
      failures.push({path:route.path,reason:'direct-deny-body'});
    }
  }
  for (const route of CLOUDFLARE_REWRITE_ROUTES) {
    const url = route.source.replace(/:([A-Za-z]+)/g,'synthetic-id');
    const chatFence = scf2 && route.id.startsWith('rewrite.chat.');
    response = await check(url,chatFence ? 503 : 404);
    if (!response) continue;
    if (chatFence) {
      const payload = await response.json().catch(()=>null);
      if (payload?.error?.code !== 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' ||
          payload?.ok !== false) {
        failures.push({path:url,reason:'seyeon-protected-chat-escaped'});
      }
    } else if ((await response.text()).trim() !== '') {
      failures.push({path:url,reason:'rewrite-deny-body'});
    }
  }
  response = await check('/api/readiness',404,{method:'POST',
    headers:{Authorization:'Bearer ' + crypto.randomUUID()}});
  if (response && (await response.text()).trim() !== '') {
    failures.push({path:'/api/readiness POST',reason:'tls-canary-deny-body'});
  }
  response = await check('/api/auth/sign-in',404,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({synthetic:true}),
  });
  if (response && (await response.text()).trim() !== '') failures.push({path:'/api/auth/sign-in',reason:'auth-deny-body-not-empty'});
  response = await check('/api/chat/synthetic-thread-id/turns',503,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({synthetic:true}),
  });
  if (response) {
    const json = await response.json().catch(()=>null);
    if (json?.ok !== false || json?.error?.code !== 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' ||
      json?.error?.retryable !== false || json?.meta?.apiContractVersion !== 'v0.9') {
      failures.push({path:'/api/chat/:id/turns',reason:'seyeon-hold-contract',actual:json});
    }
  }
  response = await check('/api/chat/synthetic-thread-id/turns',scf2 ? 503 : 404);
  if (response) {
    if (scf2) {
      const json = await response.json().catch(()=>null);
      if (json?.error?.code !== 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' ||
          json?.ok !== false) failures.push({path:'/api/chat/:id/turns GET',reason:'seyeon-fence-missing'});
    } else if ((await response.text()).trim() !== '') {
      failures.push({path:'/api/chat/:id/turns GET',reason:'unexpected-body'});
    }
  }
  if (scf2) {
    response = await check('/api/chat',404,{method:'POST'});
    if (response && (await response.text()).trim() !== '') {
      failures.push({path:'/api/chat POST',reason:'unported-chat-open-exposed'});
    }
    response = await check('/api/chat/synthetic-thread-id/turns?replay=1',503,{method:'POST'});
    if (response && (await response.json().catch(()=>null))?.error?.code !==
        'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE') {
      failures.push({path:'/api/chat/:id/turns replay',reason:'replay-hold-escaped'});
    }
    response = await check('/api/me/saju/calculation',404,{method:'POST'});
    if (response && (await response.text()).trim() !== '') {
      failures.push({path:'/api/me/saju/calculation',reason:'calculation-authority-bypass'});
    }
  }
  const opsMetrics = scf2 ? summarizeCloudflarePreviewProbeMetricsV1(timingSamples) : null;
  const opsStopGate = scf2 ? assessCloudflarePreviewOpsStopGateV1({
    metrics:opsMetrics,expectedCommit:expectedHead,attestedCommit,
  }) : null;
  if (opsStopGate?.previewDecision === 'STOP_REHEARSAL') {
    failures.push({reason:'ops-stop-gate',codes:opsStopGate.reasons});
  }
  const result = {
    status:failures.length ? 'FAIL' : 'PASS',origin:parsed.origin,contract,
    ...(scf2 ? { attestedCommit: expectedHead } : {}),
    testedHtml:HTML_ENTRIES.length,requests,liveness:'GET 200; other methods 405',readiness:'404 HOLD',seyeon:'503 HOLD',
    ...(scf2 ? { opsProbeMetrics:opsMetrics, opsStopGate } : {}),
    failures,
  };
  console.log(JSON.stringify(result,null,2));
  assert(!failures.length,'Cloudflare live preview HTTP parity/safety failure');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
