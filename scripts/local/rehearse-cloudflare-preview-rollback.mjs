#!/usr/bin/env node
// Safe-by-default, Preview-only actual rollback/restore rehearsal.
// Does NOT change Git refs, Vercel, DNS, Worker Production or Secrets.
// Watchtower-Track: ops
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CF_PREVIEW_DRILL_V1 = Object.freeze({
  worker: 'myeongha',
  preview: 'feat/ops/cloudflare-authdb-clean-snapshot-20261021',
  origin: 'https://feat-ops-cloudflare-authdb-clean-snapshot-20261021-myeongha.gycha0109.workers.dev',
  cliVersion: '4.151.2',
});
const SHA = /^[a-f0-9]{40}$/u;
const RECEIPT_PATH = '/_myeongha-preview-build.json';

export function parseCloudflarePreviewRehearsalV1(argv) {
  if (argv.length === 1 && argv[0] === '--help') return null;
  const out = { rollback: '', restore: '', apply: false, previewOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--rollback' && argv[i + 1] && !out.rollback) out.rollback = argv[++i];
    else if (arg === '--restore' && argv[i + 1] && !out.restore) out.restore = argv[++i];
    else if (arg === '--apply' && !out.apply) out.apply = true;
    else if (arg === '--confirm-preview-only' && !out.previewOnly) out.previewOnly = true;
    else throw Error('Invalid/duplicate rollback rehearsal argument');
  }
  if (!SHA.test(out.rollback) || !SHA.test(out.restore) || out.rollback === out.restore) {
    throw Error('Provide distinct exact 40-character --rollback and --restore commits');
  }
  if (out.apply && !out.previewOnly) {
    throw Error('Applying a Preview rehearsal requires --confirm-preview-only');
  }
  return Object.freeze(out);
}

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8', timeout: 20_000, stdio: ['ignore','pipe','ignore'],
  }).trim();
}

function assertLocalCheckout(cwd, plan) {
  if (git(cwd, 'rev-parse', '--show-toplevel').toLowerCase() !==
      resolve(cwd).toLowerCase()) throw Error('Command must run at Git repository root');
  if (git(cwd, 'symbolic-ref', '--short', 'HEAD') !== CF_PREVIEW_DRILL_V1.preview) {
    throw Error('Wrong Git branch; cannot touch another Preview');
  }
  if (git(cwd, 'rev-parse', 'HEAD') !== plan.restore) throw Error('Restore commit must be local HEAD');
  if (git(cwd, 'status', '--porcelain') !== '') throw Error('Git worktree must be clean');
  // Both refs must be real local commits, with the previous SHA an ancestor.
  if (git(cwd, 'rev-parse', plan.rollback + '^{commit}') !== plan.rollback) {
    throw Error('Rollback commit not available locally');
  }
  if (git(cwd, 'merge-base', plan.rollback, plan.restore) !== plan.rollback) {
    throw Error('Rollback commit must be an ancestor of restore commit');
  }
  const config = JSON.parse(execFileSync('git', ['-C', cwd, 'show', plan.restore + ':wrangler.jsonc'], {
    encoding: 'utf8', timeout: 20_000, stdio: ['ignore','pipe','ignore'],
  }));
  if (config.name !== CF_PREVIEW_DRILL_V1.worker || config.workers_dev !== false ||
      config.preview_urls !== true || config.main !== './workers/cloudflare-static-preview.mjs' ||
      config.assets?.html_handling !== 'none' ||
      JSON.stringify(config.assets?.run_worker_first) !== JSON.stringify(['/api','/api/*'])) {
    throw Error('Worker configuration is not restricted to the approved Preview');
  }
}

async function receipt(expected) {
  const response = await fetch(CF_PREVIEW_DRILL_V1.origin + RECEIPT_PATH, {
    redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(15_000),
  });
  if (response.status !== 200 || response.headers.has('location') ||
      response.headers.has('set-cookie') ||
      !response.headers.get('cache-control')?.includes('no-store')) {
    throw Error('Preview receipt unavailable or insecure');
  }
  const data = await response.json();
  if (data.schema !== 'myeongha-cloudflare-preview-build-v1' || data.commit !== expected) {
    throw Error('Preview commit mismatch; another deployment may have won the race');
  }
}

async function run(executable, args, cwd, env = process.env) {
  await new Promise((ok, fail) => {
    const child = spawn(executable, args, {
      cwd, env, shell: process.platform === 'win32',
      stdio: ['ignore', 'ignore', 'ignore'], // suppress potentially private CLI output
      windowsHide: true,
    });
    let done = false;
    child.on('error', () => { if (!done) { done = true; fail(Error('CLI did not launch')); } });
    child.on('close', code => {
      if (done) return;
      done = true;
      code === 0 ? ok() : fail(Error('Preview rehearsal command failed'));
    });
  });
}

async function publishSnapshot(root, revision, beforeDeploy = () => {}) {
  const folder = await mkdtemp(join(tmpdir(), 'myeongha-cf-preview-rehearsal-'));
  let checkedOut = false;
  try {
    await run('git', ['-C', root, 'worktree', 'add', '--detach', folder, revision], root);
    checkedOut = true;
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], folder);
    await run(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run','build:cloudflare:static'], folder);
    const config = JSON.parse(await readFile(join(folder, 'wrangler.jsonc'), 'utf8'));
    if (config.name !== CF_PREVIEW_DRILL_V1.worker || config.workers_dev !== false ||
        config.preview_urls !== true) throw Error('Rollback snapshot Worker policy drift');
    // The CLI may return a transport error AFTER Cloudflare has accepted a
    // deployment. Mark the attempt before invoking it so restore is never
    // skipped on an ambiguous result.
    beforeDeploy();
    await run(process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--yes', 'wrangler@' + CF_PREVIEW_DRILL_V1.cliVersion, 'preview',
       '--name', CF_PREVIEW_DRILL_V1.preview,
       '--worker-name', CF_PREVIEW_DRILL_V1.worker, '--config', 'wrangler.jsonc'], folder);
  } finally {
    if (checkedOut) {
      try { await run('git', ['-C', root, 'worktree', 'remove', '--force', folder], root); } catch {}
    }
    await rm(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

async function awaitReceipt(revision) {
  // Allow for Preview propagation but never mistake an old deployment for PASS.
  for (let attempt = 0; attempt < 24; attempt++) {
    try { await receipt(revision); return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
  throw Error('Preview deployment did not propagate the exact committed revision');
}

async function smokeCurrent(root, revision) {
  await run(process.execPath, ['scripts/verify-cloudflare-preview-remote.mjs'], root, {
    ...process.env,
    MYEONGHA_CLOUDFLARE_PREVIEW_URL: CF_PREVIEW_DRILL_V1.origin,
    MYEONGHA_CLOUDFLARE_SMOKE_CONTRACT: 'scf2-stage5',
    MYEONGHA_CLOUDFLARE_EXPECTED_HEAD: revision,
  });
}

async function main() {
  const plan = parseCloudflarePreviewRehearsalV1(process.argv.slice(2));
  if (!plan) {
    console.log('Usage: node scripts/local/rehearse-cloudflare-preview-rollback.mjs --rollback <old40> --restore <head40> [--apply --confirm-preview-only]');
    return;
  }
  const root = process.cwd();
  assertLocalCheckout(root, plan);
  console.log('Preview-only ' + (plan.apply ? 'REHEARSAL' : 'DRY RUN') +
    ': ' + CF_PREVIEW_DRILL_V1.worker + ' / ' + CF_PREVIEW_DRILL_V1.preview +
    '; previous=' + plan.rollback + '; restore=' + plan.restore);
  if (!plan.apply) return; // No Network, CLI build, Secrets or Cloudflare mutations.
  await receipt(plan.restore);
  await smokeCurrent(root, plan.restore);
  let rollbackMayHavePublished = false;
  try {
    await publishSnapshot(root, plan.rollback, () => { rollbackMayHavePublished = true; });
    await awaitReceipt(plan.rollback);
    await smokeCurrent(root, plan.rollback);
  } finally {
    if (rollbackMayHavePublished) {
      // Even on ambiguous CLI return, attempt to restore the current PR HEAD.
      await publishSnapshot(root, plan.restore);
      await awaitReceipt(plan.restore);
      await smokeCurrent(root, plan.restore);
    }
  }
  console.log('Preview-only rollback and restoration finished at exact SHA ' + plan.restore);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Preview-only rollback rehearsal STOPPED; do not claim restoration without exact-SHA smoke.');
    process.exitCode = 1;
  });
}
