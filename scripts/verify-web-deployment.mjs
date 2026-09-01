import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';

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

const globalHeaders = (vercelConfig.headers ?? []).find(
  (entry) => entry.source === '/(.*)',
)?.headers ?? [];
const robotsHeader = globalHeaders.find(
  (header) => header.key.toLowerCase() === 'x-robots-tag',
)?.value;
if (robotsHeader !== 'noindex, nofollow, noarchive') {
  throw new Error('Prototype deployment must remain noindex until the public-launch gate changes it.');
}

console.log(`MyeongHa deployment verification passed for ${deployedFiles.length} static files.`);
