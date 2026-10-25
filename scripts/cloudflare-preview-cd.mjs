import { execFileSync, spawnSync } from 'node:child_process';
import { accessSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Workers Builds Git integration owns the trigger and credentials.
// This deploy entrypoint is intentionally limited to one preview branch.
export const CLOUDFLARE_PREVIEW_CD_V1 = Object.freeze({
  branch: 'feat/approved-character-card-labels-20261022',
  previewName: 'approved-character-labels',
  workerName: 'myeongha',
  wranglerVersion: '4.152.0',
});

const SHA_PATTERN = /^[a-f0-9]{40}$/u;

export function resolveCloudflarePreviewCdAdmission({
  workersCi,
  branch,
  commitSha,
  checkoutSha,
}) {
  if (workersCi !== '1') {
    throw new Error('Cloudflare preview CD requires the Workers Builds environment; local/manual uploads are prohibited.');
  }
  if (branch !== CLOUDFLARE_PREVIEW_CD_V1.branch) {
    throw new Error(`Cloudflare preview CD rejected branch: ${branch || '<unset>'}.`);
  }
  if (!SHA_PATTERN.test(commitSha ?? '') || checkoutSha !== commitSha) {
    throw new Error('Cloudflare preview CD requires the exact checked-out Git commit SHA.');
  }
  return Object.freeze({
    commitSha,
    branch,
    previewName: CLOUDFLARE_PREVIEW_CD_V1.previewName,
  });
}

export function assertCloudflarePreviewConfiguration(config) {
  const expected = CLOUDFLARE_PREVIEW_CD_V1;
  if (
    config?.name !== expected.workerName ||
    !Array.isArray(config?.compatibility_flags) ||
    config.compatibility_flags.length !== 1 ||
    config.compatibility_flags[0] !== 'nodejs_compat' ||
    config?.main !== './cloudflare/myeongha-worker.mjs' ||
    config?.workers_dev !== true ||
    config?.preview_urls !== true ||
    config?.assets?.directory !== './public' ||
    config?.assets?.binding !== 'ASSETS' ||
    config?.assets?.run_worker_first !== true ||
    config?.assets?.html_handling !== 'none' ||
    config?.assets?.not_found_handling !== 'none' ||
    !config?.previews ||
    typeof config.previews !== 'object' ||
    Array.isArray(config.previews) ||
    config?.routes !== undefined ||
    config?.route !== undefined ||
    config?.services !== undefined
  ) {
    throw new Error('Cloudflare preview CD must target the existing single Worker with isolated preview deployment and no Worker service bindings.');
  }
  return true;
}

function runFromWorkersBuilds() {
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
  const admitted = resolveCloudflarePreviewCdAdmission({
    workersCi: process.env.WORKERS_CI,
    branch: process.env.WORKERS_CI_BRANCH,
    commitSha: process.env.WORKERS_CI_COMMIT_SHA,
    checkoutSha,
  });
  const config = JSON.parse(readFileSync(resolve(projectRoot, 'wrangler.jsonc'), 'utf8'));
  assertCloudflarePreviewConfiguration(config);
  for (const path of ['public/index.html', 'public/chat.html', 'public/reading-detail.html']) {
    accessSync(resolve(projectRoot, path));
  }

  console.log(`Cloudflare preview CD: branch=${admitted.branch}, commit=${admitted.commitSha}, preview=${admitted.previewName}`);
  const args = [
    '--yes',
    `wrangler@${CLOUDFLARE_PREVIEW_CD_V1.wranglerVersion}`,
    'preview',
    '--name',
    admitted.previewName,
  ];
  const child = spawnSync('npx', args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Cloudflare preview CD failed: wrangler exit ${child.status ?? 'unknown'}.`);
  }
}

// Importing the policy from Vitest must never deploy anything.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFromWorkersBuilds();
}
