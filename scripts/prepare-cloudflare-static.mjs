// Generate Cloudflare-only static asset headers from the active Vercel
// policy. Keep this AFTER build:web: its copy allowlist skips _headers.
// Watchtower-Track: ops
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  return join(outputRoot, '_headers');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeCloudflareStaticHeaders().then(
    (path) => console.log('Cloudflare static headers prepared:', path),
    (error) => { console.error(error); process.exitCode = 1; },
  );
}
