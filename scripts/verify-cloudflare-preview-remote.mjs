// Verify the deployed, public Cloudflare Preview from GitHub Actions.
// Read-only synthetic requests; never touch a user account or production origin.
// Watchtower-Track: ops
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';

const URL_FROM_CLOUDFLARE = 'https://feat-ops-cloudflare-static-preview-20261020-myeongha.gycha0109.workers.dev';
const origin = process.env.MYEONGHA_CLOUDFLARE_PREVIEW_URL || URL_FROM_CLOUDFLARE;
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
let requests = 0;
async function check(path, status, options = {}) {
  const target = new URL(path, parsed);
  assert(target.origin === parsed.origin, 'Cross-origin test prohibited');
  const request = {...options, redirect:'manual', signal:AbortSignal.timeout(15_000)};
  let response;
  try {
    response = await fetch(target, request);
    requests++;
  } catch (error) {
    failures.push({method:request.method ?? 'GET',path,reason:'transport',message:String(error)});
    return null;
  }
  if (response.status !== status) failures.push({path,reason:'http-status',expected:status,actual:response.status});
  for (const key of expected) {
    if (response.headers.get(key) !== baseline.get(key)) failures.push({
      path,reason:'security-header',header:key,expected:baseline.get(key),actual:response.headers.get(key),
    });
  }
  if (response.headers.has('set-cookie')) failures.push({path,reason:'unexpected-cookie'});
  if (response.headers.has('location')) failures.push({path,reason:'unexpected-redirect',location:response.headers.get('location')});
  const cache = response.headers.get('cache-control') || '';
  if (!cache.includes('no-store')) failures.push({path,reason:'cache-must-not-store',actual:cache});
  return response;
}

async function main() {
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
  for (const path of ['/missing-page.html','/api','/api/health','/api/readings','/api/me','/api/unknown']) {
    response = await check(path,404);
    if (!response) continue;
    if ((await response.text()).trim() !== '') failures.push({path,reason:'deny-body-not-empty'});
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
  response = await check('/api/chat/synthetic-thread-id/turns',404);
  if (response && (await response.text()).trim() !== '') failures.push({path:'/api/chat/:id/turns GET',reason:'unexpected-body'});
  const result = {
    status:failures.length ? 'FAIL' : 'PASS',origin:parsed.origin,
    testedHtml:HTML_ENTRIES.length,requests,seyeon:'503 HOLD',failures,
  };
  console.log(JSON.stringify(result,null,2));
  assert(!failures.length,'Cloudflare live preview HTTP parity/safety failure');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
