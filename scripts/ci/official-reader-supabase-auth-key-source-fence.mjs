#!/usr/bin/env node
// D3e26: source-only closed inventory of direct Supabase app key references.
// This does NOT inspect or validate actual Vercel environment variables.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectAdminPasswordSourceInventory,
} from './official-reader-production-admin-secret-fence.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ENV_NAME = 'MYEONGHA_SUPABASE_API_KEY';
const EXPECTED_DIRECT_ENV_READERS = new Set([
  'apps/api/src/production-user-data-runtime-config.ts',
  'apps/api/src/supabase-auth-http.ts',
]);
const MUST_GUARD = [
  ...EXPECTED_DIRECT_ENV_READERS,
  'apps/api/src/supabase-member-identity-verifier.ts',
];

export function classifyDirectEnvReader(file, source) {
  const runtimeApiSource =
    file.startsWith('apps/api/src/') || file.startsWith('api/');
  if (!runtimeApiSource || !source.includes(ENV_NAME)) return null;
  return EXPECTED_DIRECT_ENV_READERS.has(file)
    ? 'approved'
    : 'unreviewed';
}

function selfTest() {
  if (classifyDirectEnvReader('apps/api/src/unsafe.ts',
    'const key = process.env.MYEONGHA_SUPABASE_API_KEY') !== 'unreviewed') {
    throw new Error('D3e26 audit self-test failed to detect new unreviewed direct key reader');
  }
  if (classifyDirectEnvReader('apps/api/src/supabase-auth-http.ts',
    "const key = env['MYEONGHA_SUPABASE_API_KEY']") !== 'approved') {
    throw new Error('D3e26 audit self-test incorrectly blocked reviewed Auth proxy');
  }
  if (classifyDirectEnvReader('apps/web/unsafe.ts',
    'const key = process.env.MYEONGHA_SUPABASE_API_KEY') !== null) {
    throw new Error('D3e26 audit self-test exceeded the backend API source scope');
  }
  console.log('PASS D3e26: direct Supabase API key source inventory self-tests');
}

function main() {
  selfTest();
  const { inspected } = inspectAdminPasswordSourceInventory(ROOT);
  const unreviewed = [];
  const approved = [];
  for (const file of inspected) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    const status = classifyDirectEnvReader(file, source);
    if (status === 'unreviewed') unreviewed.push(file);
    if (status === 'approved') approved.push(file);
  }
  for (const file of unreviewed) {
    // Only file names, never source lines/key bytes/connection strings.
    console.error('HOLD D3e26: unreviewed direct Supabase API key reader: ' + file);
  }
  if (approved.length !== EXPECTED_DIRECT_ENV_READERS.size) {
    console.error('HOLD D3e26: expected direct key readers missing from pinned source inventory');
  }

  let guardDrift = false;
  for (const file of MUST_GUARD) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    if (!source.includes('isLeastPrivilegeSupabaseAuthApiKeyV1(')) {
      guardDrift = true;
      console.error('HOLD D3e26: least-privilege Supabase API key guard missing: ' + file);
    }
  }

  if (unreviewed.length || guardDrift ||
      approved.length !== EXPECTED_DIRECT_ENV_READERS.size) {
    process.exitCode = 1;
    return;
  }
  console.log('PASS D3e26: reviewed two direct backend Supabase key env readers '
    + 'and three guarded Auth call paths across ' + inspected.length
    + ' source files');
  console.log('HOLD D3e26: static source audit does not prove deployed key type or Auth API response');
}

main();
