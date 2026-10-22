#!/usr/bin/env node
// Transfer selected Vercel environment entries to undeployed Worker versions or
// explicitly named Preview scopes. Never log secrets or deploy Production.
// Watchtower-Track: ops
import { readFile, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, relative, sep } from 'node:path';
import { parseEnv } from 'node:util';

const WORKER_NAME = 'myeongha';
const CURRENT_PREVIEW_NAME = 'feat-ops-cloudflare-authdb-clean-snapshot-20261021';
// The user requires test-only PostgreSQL to remain local Docker.
// Never copy Production data-plane keys to a public Preview.
const PREVIEW_FORBIDDEN_KEYS = [
  /^MYEONGHA_DATABASE_/,
  /^MYEONGHA_SUPABASE_API_KEY$/,
  /^MYEONGHA_GUEST_FINGERPRINT_SECRET$/,
  /^MYEONGHA_AUTH_RATE_LIMIT_SECRET$/,
  /^MYEONGHA_NAVER_OAUTH_BRIDGE_KEY$/,
  /^MYEONGHA_BIRTH_INPUT_/,
  /^MYEONGHA_SAJU_SERVICE_/,
  /^MYEONGHA_CLOUDFLARE_(AUTH|SAJU)_/,
  /^MYEONGHA_SOCIAL_AUTH_/,
  /^MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED$/,
  /^OPENAI_/,
  /^PORTONE_/,
];

const WRANGLER_VERSION = '4.151.2';

function usage() {
  return [
    'Usage: node scripts/local/migrate-vercel-env-to-cloudflare-version.mjs (--from-process-env | --source .env.migration) --keys NAME1,NAME2 [--apply] [--preview-base | --preview-name feat-ops-cloudflare-authdb-clean-snapshot-20261021]',
    '',
    'Default is a dry run that prints KEY NAMES ONLY. --apply uploads selected keys',
    'to an UNDEPLOYED Worker version of myeongha; it never changes DNS or deploys.',
    '--preview-base changes NEW Preview defaults only; existing Previews do NOT inherit updates.',
    '--preview-name explicitly updates the EXISTING named Preview and creates a Preview deployment.',
    'For Preview, importing production DB/auth/AI/commerce secrets is blocked.',
    'Recommended: npx vercel env run -e production -- node scripts/local/migrate-vercel-env-to-cloudflare-version.mjs --from-process-env --keys NAME1,NAME2 --apply',
    'Or prepare a local file with: npx vercel env pull .env.migration --environment=production',
    'Do not check this file into Git. Delete it after use.',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return null;
  const options = { apply: false, source: '', fromProcessEnv: false, previewBase: false, previewName: '', keys: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      if (options.apply) throw new Error('Duplicate --apply flag.');
      options.apply = true;
    } else if (arg === '--preview-base') {
      if (options.previewBase) throw new Error('Duplicate --preview-base.');
      options.previewBase = true;
    } else if (arg === '--preview-name' && argv[index + 1]) {
      if (options.previewName) throw new Error('Duplicate --preview-name.');
      options.previewName = argv[++index];
    } else if (arg === '--from-process-env') {
      if (options.fromProcessEnv) throw new Error('Duplicate --from-process-env.');
      options.fromProcessEnv = true;
    } else if (arg === '--source' && argv[index + 1]) {
      if (options.source) throw new Error('Duplicate --source.');
      options.source = argv[++index];
    } else if (arg === '--keys' && argv[index + 1]) {
      if (options.keys.length) throw new Error('Duplicate --keys.');
      options.keys = argv[++index].split(',').map((key) => key.trim());
    } else {
      throw new Error('Invalid argument. Use --help for usage.');
    }
  }
  if (Boolean(options.source) === options.fromProcessEnv ||
      (options.previewBase && options.previewName !== '') ||
      (options.previewName !== '' && options.previewName !== CURRENT_PREVIEW_NAME) ||
      !options.keys.length || options.keys.length > 100 ||
      options.keys.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) ||
      new Set(options.keys).size !== options.keys.length) {
    throw new Error('Provide a local --source and 1–100 distinct --keys.');
  }
  if ((options.previewBase || options.previewName) &&
      options.keys.some((key) => PREVIEW_FORBIDDEN_KEYS.some((pattern) => pattern.test(key)))) {
    throw new Error('Production user-data, Auth, AI, or Commerce secrets cannot be imported into a Preview.');
  }
  return options;
}

async function readSelectedSecrets(cwd, options) {
  if (options.fromProcessEnv) {
    const selected = Object.create(null);
    for (const key of options.keys) {
      if (!Object.hasOwn(process.env, key) || !process.env[key]) {
        throw new Error('Missing selected process environment key.');
      }
      selected[key] = process.env[key];
    }
    return selected;
  }
  const sourcePath = resolve(cwd, options.source);
  const outputDir = resolve(cwd, 'public');
  const relPublic = relative(outputDir, sourcePath);
  const relGit = relative(resolve(cwd, '.git'), sourcePath);
  if ((relPublic !== '..' && !relPublic.startsWith('..' + sep)) ||
      (relGit !== '..' && !relGit.startsWith('..' + sep))) {
    throw new Error('Secret source cannot be inside public/ or .git/.');
  }
  const stat = await lstat(sourcePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Secret source must be a regular, non-symlink file.');
  }
  const raw = await readFile(sourcePath, 'utf8');
  const values = parseEnv(raw);
  const selected = Object.create(null);
  for (const key of options.keys) {
    if (!Object.hasOwn(values, key) || !values[key]) {
      throw new Error('One or more requested keys were missing or empty. No upload performed.');
    }
    selected[key] = values[key];
  }
  return selected;
}

function uploadToCloudflare(cwd, values, options) {
  return new Promise((resolveUpload, rejectUpload) => {
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = options.previewBase
      ? ['--yes', 'wrangler@' + WRANGLER_VERSION, 'preview', 'base-config', 'secret', 'bulk', '--worker-name', WORKER_NAME, '--config', 'wrangler.jsonc']
      : options.previewName
        ? ['--yes', 'wrangler@' + WRANGLER_VERSION, 'preview', 'secret', 'bulk', '--name', options.previewName, '--worker-name', WORKER_NAME, '--config', 'wrangler.jsonc']
        : ['--yes', 'wrangler@' + WRANGLER_VERSION, 'versions', 'secret', 'bulk', '--name', WORKER_NAME, '--config', 'wrangler.jsonc'];
    const child = spawn(executable, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'ignore', 'ignore'], // Never print CLI output or secret values.
      windowsHide: true,
    });
    child.on('error', () => rejectUpload(new Error('Wrangler could not be started.')));
    child.on('close', (code) => {
      if (code === 0) resolveUpload();
      else rejectUpload(new Error('Wrangler secret upload failed; inspect local Wrangler authentication and project access.'));
    });
    child.stdin.on('error', () => {}); // Child may reject input and exit early.
    child.stdin.end(JSON.stringify(values)); // Not a CLI argument, temp file, PR, or log.
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    console.log(usage());
    return;
  }
  const cwd = process.cwd();
  const config = JSON.parse(await readFile(resolve(cwd, 'wrangler.jsonc'), 'utf8'));
  if (config.name !== WORKER_NAME || config.workers_dev !== false ||
      config.main !== './workers/cloudflare-static-preview.mjs') {
    throw new Error('This command is restricted to the existing myeongha preview Worker.');
  }
  const values = await readSelectedSecrets(cwd, options);
  const target = options.previewBase ? 'preview-base(new previews only)' :
    options.previewName ? 'named-preview(deploys preview only)' : 'undeployed-production-version';
  console.log('Worker: ' + WORKER_NAME + '; target: ' + target + '; selected key names: ' + options.keys.join(', '));
  if (!options.apply) {
    console.log('DRY RUN ONLY. No secret was sent. Use --apply only for your intended target.');
    return;
  }
  await uploadToCloudflare(cwd, values, options);
  console.log(options.previewBase
    ? 'Selected secrets uploaded to Preview base config. Existing Previews remain unchanged.'
    : options.previewName
      ? 'Selected secrets uploaded to the named Preview, creating a new Preview deployment. Production routing unchanged.'
      : 'Selected secrets uploaded to a NEW, UNDEPLOYED Worker version. No traffic was switched.');
}

main().catch(() => {
  // Error objects may contain source text or credentials. Output a fixed message.
  console.error('Secret migration stopped. Check the local source, keys, Wrangler configuration, and CLI authentication.');
  process.exitCode = 1;
});
