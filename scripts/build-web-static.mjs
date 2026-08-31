import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const sourceRoot = resolve(process.cwd(), 'apps/web');
const outputRoot = resolve(
  process.cwd(),
  process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public',
);

const allowedExtensions = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
]);

const deniedBasenames = new Set([
  'package.json',
  'README.md',
  'dev-server.mjs',
]);

let copiedFiles = 0;

async function copyPublicTree(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`Symlink is not allowed in static web output: ${sourcePath}`);
    }

    if (entry.isDirectory()) {
      await copyPublicTree(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (deniedBasenames.has(entry.name)) {
      continue;
    }

    if (!allowedExtensions.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    await copyFile(sourcePath, targetPath);
    copiedFiles += 1;
  }
}

if (sourceRoot === outputRoot) {
  throw new Error('Static web source and output directories must be different.');
}

await rm(outputRoot, { recursive: true, force: true });
await copyPublicTree(sourceRoot, outputRoot);

console.log(
  `MyeongHa static web build: copied ${copiedFiles} files from ${relative(
    process.cwd(),
    sourceRoot,
  )} to ${relative(process.cwd(), outputRoot)}`,
);
