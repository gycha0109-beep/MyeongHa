// Generate Cloudflare-only static asset headers from the active Vercel
// policy. Keep this AFTER build:web: its copy allowlist skips _headers.
// Watchtower-Track: ops
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve the root landing URL while disabling automatic clean-URL HTML rewriting.
// Cloudflare Static Assets supports same-site 200 proxying via _redirects.
export const CLOUDFLARE_ROOT_REWRITE = '/ /index.html 200\n';
export const CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1 = '_myeongha-preview-build.json';
export const CLOUDFLARE_PREVIEW_RECEIPT_SCHEMA_V1 = 'myeongha-cloudflare-preview-build-v1';

export function gitCloudflareBuildCommitV1(cwd) {
  // Git is authoritative: Cloudflare Worker Builds check out the PR branch.
  // The receipt must never rely on an arbitrary caller-supplied HTTP header.
  const sha = execFileSync('git', ['-C', cwd, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Cloudflare build checkout is not an exact Git commit.');
  }
  return sha;
}

export function renderCloudflarePreviewReceiptV1(commit) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('Cloudflare Preview receipt requires an exact 40-digit Git SHA.');
  }
  return JSON.stringify({ schema: CLOUDFLARE_PREVIEW_RECEIPT_SCHEMA_V1, commit }) + '\n';
}

export const REQUIRED_SECURITY_HEADERS = Object.freeze([
  'Content-Security-Policy',
  'Referrer-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'X-Robots-Tag',
]);

export function renderCloudflareStaticHeaders(vercelConfig) {
  if (
    !vercelConfig ||
    !Array.isArray(vercelConfig.headers) ||
    vercelConfig.headers.length !== 1 ||
    vercelConfig.headers[0]?.source !== '/(.*)' ||
    !Array.isArray(vercelConfig.headers[0].headers)
  ) {
    throw new Error('Vercel security headers changed: explicit Cloudflare review required.');
  }

  const policy = new Map();
  for (const header of vercelConfig.headers[0].headers) {
    const name = header?.key;
    const value = header?.value;
    if (
      typeof name !== 'string' || typeof value !== 'string' ||
      !/^[A-Za-z0-9-]+$/.test(name) ||
      value.length === 0 || /[\r\n]/.test(value) ||
      policy.has(name.toLowerCase())
    ) {
      throw new Error('Invalid/duplicate Vercel security header.');
    }
    policy.set(name.toLowerCase(), { name, value });
  }

  const keys = new Set(REQUIRED_SECURITY_HEADERS.map((x) => x.toLowerCase()));
  if (policy.size !== keys.size || [...policy.keys()].some((x) => !keys.has(x))) {
    throw new Error('Vercel security header set changed: update Cloudflare policy deliberately.');
  }

  const headers = REQUIRED_SECURITY_HEADERS.map((name) => {
    const entry = policy.get(name.toLowerCase());
    if (!entry || entry.value.trim() !== entry.value) {
      throw new Error(`Vercel security header missing or malformed: ${name}`);
    }
    return `  ${name}: ${entry.value}`;
  });

  if (
    !policy.get('content-security-policy').value.includes("default-src 'self'") ||
    policy.get('x-content-type-options').value !== 'nosniff' ||
    policy.get('x-frame-options').value !== 'DENY'
  ) {
    throw new Error('Security policy weakened: Cloudflare static build blocked.');
  }

  // The first rule applies to all static assets. Subsequent rules explicitly
  // disable HTML caching; no protected API response is served as an asset.
  return [
    '/*',
    ...headers,
    '',
    '/',
    '  Cache-Control: no-store',
    '',
    '/*.html',
    '  Cache-Control: no-store',
    '',
    '/' + CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1,
    '  Cache-Control: no-store',
    '',
  ].join('\n');
}

export async function writeCloudflareStaticHeaders(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const outputDirectory = options.outputDirectory ??
    process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public';
  const config = JSON.parse(
    await readFile(resolve(cwd, 'vercel.json'), 'utf8'),
  );
  const headers = renderCloudflareStaticHeaders(config);
  const outputRoot = resolve(cwd, outputDirectory);
  // The build must have produced its expected entrypoint. Do not create a
  // misleading empty Static Assets directory on a failed frontend build.
  await readFile(join(outputRoot, 'index.html'));
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, '_headers'), headers, { encoding: 'utf8' });
  await writeFile(join(outputRoot, '_redirects'), CLOUDFLARE_ROOT_REWRITE, { encoding: 'utf8' });
  const commit = options.commitSha ?? gitCloudflareBuildCommitV1(cwd);
  await writeFile(
    join(outputRoot, CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1),
    renderCloudflarePreviewReceiptV1(commit),
    { encoding: 'utf8' },
  );
  return join(outputRoot, '_headers');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeCloudflareStaticHeaders().then(
    (path) => console.log('Cloudflare static headers prepared:', path),
    (error) => { console.error(error); process.exitCode = 1; },
  );
}
