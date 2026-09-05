import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const outputRoot = resolve(
  process.cwd(),
  process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public',
);
const apiRoot = resolve(process.cwd(), 'api');
const VERCEL_SERVERLESS_FUNCTION_LIMIT = 12;
const serverlessFunctionExtensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.jsx',
  '.tsx',
]);

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
const apiTestFilePattern = /\.(?:test|spec)\.[^/\\]+$/u;

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

const apiFiles = await collectFiles(apiRoot);
const apiTestFiles = apiFiles.filter((file) => apiTestFilePattern.test(file));
if (apiTestFiles.length > 0) {
  throw new Error(
    `Test/spec files must stay outside the Vercel API function root: ${apiTestFiles.join(', ')}`,
  );
}

const serverlessFunctionFiles = apiFiles.filter((file) =>
  serverlessFunctionExtensions.has(extname(file).toLowerCase()),
);
if (serverlessFunctionFiles.length > VERCEL_SERVERLESS_FUNCTION_LIMIT) {
  throw new Error(
    `Vercel production function budget exceeded: ${serverlessFunctionFiles.length}/${VERCEL_SERVERLESS_FUNCTION_LIMIT}. Keep tests and non-route modules outside api/ or intentionally change the deployment plan and this guard.`,
  );
}

const vercelConfig = JSON.parse(await readFile(resolve('vercel.json'), 'utf8'));
if (vercelConfig.buildCommand !== 'npm run build:web') {
  throw new Error('vercel.json buildCommand must remain npm run build:web.');
}
if (vercelConfig.outputDirectory !== 'public') {
  throw new Error('vercel.json outputDirectory must remain public.');
}
if (vercelConfig.git?.deploymentEnabled?.['**'] !== false) {
  throw new Error('Automatic Vercel deployments must default to disabled for non-main branches.');
}
if (vercelConfig.git?.deploymentEnabled?.main !== true) {
  throw new Error('Automatic Vercel production deployment must remain enabled for main.');
}

const birthProfileRewrite = (vercelConfig.rewrites ?? []).find(
  (entry) => entry.source === '/api/birth-profiles/:id',
);
if (
  birthProfileRewrite?.destination !==
  '/api/birth-profiles?__myeongha_birth_profile_id=:id'
) {
  throw new Error(
    'Birth Profile dynamic API route must carry its captured id to the static dispatcher through the private rewrite locator.',
  );
}
if (
  (vercelConfig.rewrites ?? []).filter(
    (entry) => entry.source === '/api/birth-profiles/:id',
  ).length !== 1
) {
  throw new Error('Birth Profile dynamic API route must have exactly one static-function rewrite.');
}

await assertExists(resolve('api/birth-profiles.ts'));
await assertMissing(
  resolve('api/birth-profiles/[id].ts'),
  'Bracket Birth Profile function must not coexist with the static dispatcher.',
);

const expectedRecordsRewrites = Object.freeze([
  Object.freeze({
    source: '/api/life-record',
    destination: '/api/me?__myeongha_records_read=life-record',
  }),
  Object.freeze({
    source: '/api/memories',
    destination: '/api/me?__myeongha_records_read=memories',
  }),
]);
for (const expected of expectedRecordsRewrites) {
  const matches = (vercelConfig.rewrites ?? []).filter(
    (entry) => entry.source === expected.source,
  );
  if (matches.length !== 1 || matches[0]?.destination !== expected.destination) {
    throw new Error(
      `${expected.source} must have exactly one rewrite to the governed /api/me Records dispatcher.`,
    );
  }
}
await assertExists(resolve('api/me.ts'));
await assertMissing(
  resolve('api/life-record.ts'),
  'Life Record must not consume a separate Vercel function while the Records dispatcher rewrite is active.',
);
await assertMissing(
  resolve('api/memories.ts'),
  'Memories must not consume a separate Vercel function while the Records dispatcher rewrite is active.',
);

const expectedChatRewrite = Object.freeze({
  source: '^/api/chat/(?<threadId>[^/]+)$',
  destination: '/api/me?__myeongha_chat_thread_id=$threadId',
});
const chatRewriteMatches = (vercelConfig.rewrites ?? []).filter(
  (entry) => entry.source === expectedChatRewrite.source,
);
if (
  chatRewriteMatches.length !== 1 ||
  chatRewriteMatches[0]?.destination !== expectedChatRewrite.destination
) {
  throw new Error(
    'Chat dynamic read route must use exactly one named capture rewrite to preserve the thread locator into the governed /api/me dispatcher.',
  );
}
await assertMissing(
  resolve('api/chat.ts'),
  'Chat reads must not consume a separate Vercel function while the /api/me dispatcher rewrite is active.',
);
await assertMissing(
  resolve('api/chat/[threadId].ts'),
  'Bracket Chat read function must not coexist with the static dispatcher rewrite.',
);

const globalHeaders = (vercelConfig.headers ?? []).find(
  (entry) => entry.source === '/(.*)',
)?.headers ?? [];
const robotsHeader = globalHeaders.find(
  (header) => header.key.toLowerCase() === 'x-robots-tag',
)?.value;
if (robotsHeader !== 'noindex, nofollow, noarchive') {
  throw new Error('Prototype deployment must remain noindex until the public-launch gate changes it.');
}

console.log(
  `MyeongHa deployment configuration verification passed for ${deployedFiles.length} static files and ${serverlessFunctionFiles.length}/${VERCEL_SERVERLESS_FUNCTION_LIMIT} serverless functions.`,
);
