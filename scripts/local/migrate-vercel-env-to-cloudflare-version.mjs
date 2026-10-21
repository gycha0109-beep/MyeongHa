#!/usr/bin/env node
// Transfer explicitly selected Vercel environment entries to a NEW, UNDEPLOYED
// Cloudflare Worker version. Nothing is published and no secret is printed.
// Watchtower-Track: ops
import { readFile, lstat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, relative, sep } from 'node:path';
import { parseEnv } from 'node:util';

const WORKER_NAME = 'myeongha';
const WRANGLER_VERSION = '4.151.2';

function usage() {
  return [
    'Usage: node scripts/local/migrate-vercel-env-to-cloudflare-version.mjs --source .env.migration --keys NAME1,NAME2 [--apply]',
    '',
    'Default is a dry run that prints KEY NAMES ONLY. --apply uploads selected keys',
    'to an UNDEPLOYED Worker version of myeongha; it never changes DNS or deploys.',
    'Prepare the local file with: npx vercel env pull .env.migration --environment=production',
    'Do not check this file into Git. Delete it after use.',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return null;
  const options = { apply: false, source: '', keys: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      if (options.apply) throw new Error('Duplicate --apply flag.');
      options.apply = true;
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
  if (!options.source || !options.keys.length || options.keys.length > 100 ||
      options.keys.some((key) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) ||
      new Set(options.keys).size !== options.keys.length) {
    throw new Error('Provide a local --source and 1–100 distinct --keys.');
  }
  return options;
}

async function readSelectedSecrets(cwd, options) {
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

function uploadUndeployedVersion(cwd, values) {
  return new Promise((resolveUpload, rejectUpload) => {
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(executable, [
      '--yes', 'wrangler@' + WRANGLER_VERSION, 'versions', 'secret', 'bulk',
      '--name', WORKER_NAME, '--config', 'wrangler.jsonc',
    ], {
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
  console.log('Worker: ' + WORKER_NAME + '; selected key names: ' + options.keys.join(', '));
  if (!options.apply) {
    console.log('DRY RUN ONLY. No secret was sent. Use --apply to create an undeployed version.');
    return;
  }
  await uploadUndeployedVersion(cwd, values);
  console.log('Selected secrets uploaded to a NEW, UNDEPLOYED Worker version. No traffic was switched.');
}

main().catch(() => {
  // Error objects may contain source text or credentials. Output a fixed message.
  console.error('Secret migration stopped. Check the local source, keys, Wrangler configuration, and CLI authentication.');
  process.exitCode = 1;
});
