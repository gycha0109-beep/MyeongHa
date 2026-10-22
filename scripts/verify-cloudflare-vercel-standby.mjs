// Cloudflare fallback readiness: read-only Vercel Production STATIC HTML.
// Never send a Cookie, Authorization, browser session, or mutate any service.
// Watchtower-Track: ops
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HTML_ENTRIES } from './verify-cloudflare-static.mjs';

export const VERCEL_STANDBY_ORIGIN_V1 = 'https://myeongha.vercel.app';
const REQUIRED_HEADERS = Object.freeze([
  'Content-Security-Policy', 'Referrer-Policy', 'X-Content-Type-Options',
  'X-Frame-Options', 'X-Robots-Tag',
]);

export function vercelStandbyStaticPolicyV1(config) {
  if (!config || !Array.isArray(config.headers) || config.headers.length !== 1 ||
      config.headers[0]?.source !== '/(.*)' ||
      !Array.isArray(config.headers[0]?.headers)) throw Error('Unexpected Vercel headers');
  const policy = new Map();
  for (const item of config.headers[0].headers) {
    const key = item?.key?.toLowerCase();
    if (!key || typeof item.value !== 'string' || !item.value ||
        policy.has(key)) throw Error('Malformed Vercel security header');
    policy.set(key, item.value);
  }
  if (policy.size !== REQUIRED_HEADERS.length ||
      REQUIRED_HEADERS.some(key => !policy.has(key.toLowerCase()))) {
    throw Error('Vercel security header baseline changed');
  }
  return policy;
}

export async function verifyVercelProductionStandbyV1({
  fetchImpl = fetch, vercelConfig, timeoutMs = 12_000,
} = {}) {
  const policy = vercelStandbyStaticPolicyV1(vercelConfig);
  const failures = [];
  for (const page of HTML_ENTRIES) {
    let response;
    try {
      // Strictly fixed host and 11 static paths; no API probing or credentials.
      response = await fetchImpl(VERCEL_STANDBY_ORIGIN_V1 + '/' + page, {
        method: 'GET', redirect: 'manual', credentials: 'omit',
        cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) failures.push({ page, reason: 'http-status', status: response.status });
      if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
        failures.push({ page, reason: 'html-mime' });
      }
      for (const [name, expected] of policy) {
        if (response.headers.get(name) !== expected) {
          failures.push({ page, reason: 'security-header', name });
        }
      }
      if (response.headers.has('location')) failures.push({ page, reason: 'redirect' });
      if (response.headers.has('set-cookie')) failures.push({ page, reason: 'unexpected-cookie' });
      // Read only for validation; never log, export or persist fetched HTML.
      const html = await response.text();
      if (!html.toLowerCase().includes('<html') ||
          !html.toLowerCase().includes('</html>')) {
        failures.push({ page, reason: 'invalid-html' });
      }
    } catch {
      failures.push({ page, reason: 'transport-or-body' });
    }
  }
  return Object.freeze({
    status: failures.length ? 'FAIL' : 'PASS',
    origin: VERCEL_STANDBY_ORIGIN_V1,
    pages: HTML_ENTRIES.length,
    failures,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cfg = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
  const report = await verifyVercelProductionStandbyV1({ vercelConfig: cfg });
  console.log('Vercel standby static-only smoke:', JSON.stringify(report));
  if (report.status !== 'PASS') process.exitCode = 1;
}
