// Validate the Cloudflare-specific artifact AFTER npm run build:web.
// No external requests, Cloudflare resource changes or credentials.
// Watchtower-Track: ops
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLOUDFLARE_ROOT_REWRITE,
  CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1,
  renderCloudflarePreviewReceiptV1,
  gitCloudflareBuildCommitV1,
  renderCloudflareStaticHeaders,
} from './prepare-cloudflare-static.mjs';

export const HTML_ENTRIES = Object.freeze([
  'index.html',
  'hall.html',
  'auth.html',
  'birth.html',
  'chat-hub.html',
  'chat.html',
  'my.html',
  'reading.html',
  'face-reading.html',
  'reading-detail.html',
  'records.html',
]);

/**
 * A public asset must not be addressable at the API root after intermediaries
 * case-fold or decode one or more layers of URI escapes. Only the first path
 * segment is authoritative; a nested "assets/api" directory is not /api.
 * This is a build-time denial, not evidence of raw Edge request routing.
 */
export function isCloudflareApiStaticAliasV1(relativeArtifactPath) {
  if (typeof relativeArtifactPath !== 'string' ||
      relativeArtifactPath.length === 0) return true;
  let candidate = relativeArtifactPath.replaceAll('\\', '/');
  for (let depth = 0; depth < 8; depth += 1) {
    if (/^api(?:$|\/)/iu.test(candidate.replace(/^\/+/u, ''))) return true;
    if (!candidate.includes('%')) return false;
    let decoded;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      // Malformed root API aliases do not become approved static names.
      return /^api/iu.test(candidate.replace(/^\/+/u, ''));
    }
    if (decoded === candidate) return false;
    candidate = decoded.replaceAll('\\', '/');
  }
  // A residual, unbounded decoding chain is not a public asset grant.
  return candidate.includes('%') ||
    /^api(?:$|\/)/iu.test(candidate.replace(/^\/+/u, ''));
}

export async function verifyCloudflareStaticArtifact(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const outputRoot = resolve(
    cwd,
    options.outputDirectory ?? process.env.MYEONGHA_WEB_OUTPUT_DIR ?? 'public',
  );
  const workerConfig = JSON.parse(
    await readFile(resolve(cwd, 'wrangler.jsonc'), 'utf8'),
  );
  if (
    workerConfig?.main !== './workers/cloudflare-static-preview.mjs' ||
    workerConfig?.workers_dev !== false ||
    workerConfig?.assets?.directory !== './public' ||
    workerConfig?.assets?.html_handling !== 'none' ||
    workerConfig?.assets?.not_found_handling !== 'none' ||
    // S-CF2 requires every Static Asset request to hit the Worker first,
    // including HTML paths with legacy chat rewrite query markers.
    workerConfig?.assets?.run_worker_first !== true
  ) {
    throw new Error('Cloudflare preview routing or isolation policy has changed.');
  }

  if (outputRoot !== resolve(cwd, workerConfig.assets.directory)) {
    throw new Error('Cloudflare output directory does not match the configured Static Assets directory.');
  }

  const currentVercelConfig = JSON.parse(
    await readFile(resolve(cwd, 'vercel.json'), 'utf8'),
  );
  const expectedHeaders = renderCloudflareStaticHeaders(currentVercelConfig);
  const actualHeaders = await readFile(join(outputRoot, '_headers'), 'utf8');
  if (actualHeaders !== expectedHeaders) {
    throw new Error('Cloudflare _headers differs from the active Vercel security policy.');
  }

  const redirects = await readFile(join(outputRoot, '_redirects'), 'utf8');
  if (redirects !== CLOUDFLARE_ROOT_REWRITE) {
    throw new Error('Unexpected Cloudflare static redirect: only / -> /index.html 200 is allowed.');
  }

  // This manifest is generated only after build:web, never copied into
  // Vercel Production. Reject a stale or tampered commit stamp.
  const expectedCommit = options.expectedCommitSha ?? gitCloudflareBuildCommitV1(cwd);
  const attested = await readFile(join(outputRoot, CLOUDFLARE_PREVIEW_RECEIPT_ASSET_V1), 'utf8');
  if (attested !== renderCloudflarePreviewReceiptV1(expectedCommit)) {
    throw new Error('Cloudflare Preview build receipt does not match the checked-out Git commit.');
  }

  for (const entry of HTML_ENTRIES) {
    await readFile(join(outputRoot, entry));
  }

  const stack = [outputRoot];
  let fileCount = 0;
  let totalAssetBytes = 0;
  let largestFileSize = 0;
  while (stack.length > 0) {
    const directory = stack.pop();
    const children = await readdir(directory, { withFileTypes: true });
    for (const entry of children) {
      const filename = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error('Symlink must not be deployed: ' + filename);
      }
      if (entry.isDirectory()) {
        if (isCloudflareApiStaticAliasV1(relative(outputRoot, filename).split(sep).join('/'))) {
          throw new Error('Static artifact cannot contain an API alias directory.');
        }
        stack.push(filename);
      } else if (entry.isFile()) {
        if (isCloudflareApiStaticAliasV1(relative(outputRoot, filename).split(sep).join('/'))) {
          throw new Error('Static artifact cannot contain an API alias file.');
        }
        const stat = await lstat(filename);
        fileCount += 1;
        totalAssetBytes += stat.size;
        largestFileSize = Math.max(largestFileSize, stat.size);
        if (stat.size > 25 * 1024 * 1024) {
          throw new Error('Static file exceeds Workers Free 25MiB: ' + filename);
        }
        if (/\.(?:map|pem|key)$/i.test(entry.name) || /^\.env(?:\.|$)/i.test(entry.name)) {
          throw new Error('Forbidden static artifact file: ' + filename);
        }
      }
    }
  }
  if (fileCount > 20_000) {
    throw new Error('Static file count exceeds Workers Free limit.');
  }

  // Static Assets bytes, NOT Wrangler Worker bundle bytes, billable
  // transfer, memory or CPU. These are different Cloudflare budgets.
  return Object.freeze({
    entryCount: HTML_ENTRIES.length, fileCount, totalAssetBytes, largestFileSize,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyCloudflareStaticArtifact().then(
    (result) => console.log('Cloudflare static artifact verified:', result),
    (error) => { console.error(error); process.exitCode = 1; },
  );
}
