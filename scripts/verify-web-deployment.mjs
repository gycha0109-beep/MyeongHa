import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { assertMainWebConfig } from './cloudflare-main-web-cd.mjs';
import { CLOUDFLARE_DIRECT_API_ROUTES, CLOUDFLARE_REWRITE_ROUTES, matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';

const outputRoot = resolve(
  process.cwd(),
  process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public',
);
const requiredFiles = [
  'index.html',
  'hall.html',
  'chat.html',
  'birth.html',
  'reading.html',
  'records.html',
  'styles.css',
  'app.js',
];

const forbiddenBasenames = new Set([
  'package.json',
  'README.md',
  'dev-server.mjs',
  '.env',
]);

const localReferencePattern = /(?:href|src)=["']([^"']+)["']/g;
const cssUrlPattern = /url\((?:["']?)([^"')]+)(?:["']?)\)/g;

async function assertExists(path) {
  try {
    await access(path);
  } catch {
    throw new Error(`Expected deployment artifact is missing: ${path}`);
  }
}

async function assertMissing(path, message) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(message);
}

async function collectFiles(root, current = root, files = []) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, path, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function shouldSkipReference(reference) {
  return (
    reference.length === 0 ||
    reference.startsWith('#') ||
    reference.toLowerCase().startsWith('%23') ||
    reference.startsWith('http://') ||
    reference.startsWith('https://') ||
    reference.startsWith('mailto:') ||
    reference.startsWith('tel:') ||
    reference.startsWith('data:') ||
    reference.startsWith('javascript:')
  );
}

function resolveLocalReference(fromFile, reference) {
  const cleanReference = reference.split('#')[0].split('?')[0];
  if (!cleanReference) {
    return null;
  }

  if (cleanReference.startsWith('/')) {
    return resolve(outputRoot, cleanReference.replace(/^\/+/, ''));
  }

  return resolve(dirname(fromFile), normalize(cleanReference));
}

for (const file of requiredFiles) {
  await assertExists(join(outputRoot, file));
}

const deployedFiles = await collectFiles(outputRoot);
for (const file of deployedFiles) {
  const basename = file.split(/[\\/]/).at(-1);
  if (forbiddenBasenames.has(basename)) {
    throw new Error(`Development-only file leaked into deployment output: ${file}`);
  }

  const extension = extname(file).toLowerCase();
  if (extension === '.map') {
    throw new Error(`Source map must not be published by the static prototype build: ${file}`);
  }

  if (!['.html', '.css'].includes(extension)) {
    continue;
  }

  const content = await readFile(file, 'utf8');
  const patterns = extension === '.html'
    ? [localReferencePattern]
    : [cssUrlPattern];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const reference = match[1].trim();
      if (shouldSkipReference(reference)) {
        continue;
      }

      const target = resolveLocalReference(file, reference);
      if (target === null) {
        continue;
      }
      if (!target.startsWith(outputRoot)) {
        throw new Error(`Deployment reference escapes output root: ${file} -> ${reference}`);
      }
      await assertExists(target);
    }
  }
}

// Validate the Cloudflare-only production Worker contract.
const workerConfig = JSON.parse(await readFile(resolve('wrangler.jsonc'), 'utf8'));
assertMainWebConfig(workerConfig);
await assertExists(resolve('cloudflare/myeongha-worker.mjs'));
await assertExists(resolve('cloudflare/preview-worker.mjs'));

for (const path of ['cloudflare/myeongha-worker.mjs', 'cloudflare/preview-worker.mjs']) {
  const source = await readFile(resolve(path), 'utf8');
  if (!/['"]X-Robots-Tag['"]\s*:\s*['"]noindex, nofollow, noarchive['"]/u.test(source)) {
    throw new Error(path + ': the unlaunched web must retain noindex security policy.');
  }
}

await assertMissing(resolve('vercel.json'), 'Retired Vercel deployment configuration must not return.');

// These counts and exact dispatch destinations are application ingress
// contracts, not a provider-imposed limit on the number of API functions.
if (CLOUDFLARE_DIRECT_API_ROUTES.length !== 12 ||
    CLOUDFLARE_REWRITE_ROUTES.length !== 24) {
  throw new Error('Cloudflare API route inventory changed without an explicit routing migration.');
}
const directPaths = CLOUDFLARE_DIRECT_API_ROUTES.map(route => route.path);
const rewrittenPaths = CLOUDFLARE_REWRITE_ROUTES.map(route => route.source);
if (new Set(directPaths).size !== directPaths.length ||
    new Set(rewrittenPaths).size !== rewrittenPaths.length ||
    directPaths.some(path => !path.startsWith('/api/')) ||
    rewrittenPaths.some(path => !path.startsWith('/api/'))) {
  throw new Error('Cloudflare API route paths must be unique, scoped and explicit.');
}
for (const route of CLOUDFLARE_REWRITE_ROUTES) {
  if (!route.destination.startsWith('/api/') || route.destination.includes('://')) {
    throw new Error('Cloudflare route cannot redirect to a remote origin: ' + route.source);
  }
  const examplePath = route.source.replace(/:[A-Za-z][A-Za-z0-9]*/gu, 'synthetic-id');
  const match = matchCloudflareApiRoute(examplePath);
  if (match?.id !== route.id || match.kind !== 'rewrite') {
    throw new Error('Cloudflare rewrite must match its own exact route: ' + route.source);
  }
}
const requiredRewrites = new Map([
  ['/api/birth-profiles/:id', '/api/birth-profiles?__myeongha_birth_profile_id=:id'],
  ['/api/life-record', '/api/me?__myeongha_records_read=life-record'],
  ['/api/readings', '/api/me?__myeongha_records_read=readings'],
  ['/api/memories', '/api/me?__myeongha_records_read=memories'],
  ['/api/me/credits', '/api/me?__myeongha_chat_credit_wallet=1'],
  ['/api/me/credits/portone/test-checkout', '/api/me?__myeongha_portone_owner_sandbox_checkout=1'],
  ['/api/me/credits/portone/test-prepare', '/api/me?__myeongha_portone_owner_sandbox_prepare=1'],
  ['/api/me/credits/portone/test-verify', '/api/me?__myeongha_portone_owner_sandbox_verify=1'],
  ['/api/chat/:threadId', '/api/me?__myeongha_chat_thread_id=:threadId'],
  ['/api/chat/:threadId/turns', '/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=:threadId'],
]);
for (const [source, destination] of requiredRewrites) {
  const matching = CLOUDFLARE_REWRITE_ROUTES.filter(route => route.source === source);
  if (matching.length !== 1 || matching[0].destination !== destination) {
    throw new Error('Governed Cloudflare API dispatcher rewrite changed: ' + source);
  }
}
await assertExists(resolve('workers/cloudflare-api-router.mjs'));
for (const path of [
  'api/birth-profiles/[id].ts',
  'api/life-record.ts', 'api/readings.ts', 'api/memories.ts',
  'api/me/credits.ts', 'api/me/credits/portone/test-checkout.ts', 'api/me/credits/portone/test-prepare.ts', 'api/me/credits/portone/test-verify.ts', 'api/chat.ts', 'api/chat/[threadId].ts',
]) {
  await assertMissing(resolve(path), 'Duplicate HTTP entrypoint bypasses the governed dispatcher: ' + path);
}

console.log(
  'MyeongHa Cloudflare deployment verification passed for ' +
  deployedFiles.length + ' static files, ' +
  CLOUDFLARE_DIRECT_API_ROUTES.length + ' direct API routes and ' +
  CLOUDFLARE_REWRITE_ROUTES.length + ' governed rewrites.',
);
