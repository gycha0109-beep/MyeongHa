#!/usr/bin/env node
// D3e26: source-only CLOSED inventory of direct Supabase app API key names.
// This does not inspect any live Vercel environment key or key value.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectAdminPasswordSourceInventory,
} from './official-reader-production-admin-secret-fence.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ENV_NAME = 'MYEONGHA_SUPABASE_API_KEY';
const CANONICAL_PUBLIC_KEY_NAME = 'apps/api/src/production-user-data-runtime-config.ts';
const ACCOUNT_DELETION_DISTINCTNESS_ONLY =
  'apps/api/src/production-account-deletion-auth-admin-config.ts';
const MUST_GUARD = Object.freeze([
  CANONICAL_PUBLIC_KEY_NAME,
  'apps/api/src/supabase-auth-http.ts',
  'apps/api/src/supabase-member-identity-verifier.ts',
]);

export function classifyDirectEnvReader(file, source) {
  const backend = file.startsWith('apps/api/src/') || file.startsWith('api/');
  if (!backend || !source.includes(ENV_NAME)) return null;
  if (file === CANONICAL_PUBLIC_KEY_NAME) return 'canonical_env_name';
  if (file === ACCOUNT_DELETION_DISTINCTNESS_ONLY) return 'deletion_distinctness_check';
  return 'unreviewed';
}

function selfTest() {
  if (classifyDirectEnvReader('apps/api/src/unsafe.ts',
    'const key = process.env.MYEONGHA_SUPABASE_API_KEY') !== 'unreviewed') {
    throw new Error('D3e26 audit self-test missed an unreviewed direct env reference');
  }
  if (classifyDirectEnvReader(CANONICAL_PUBLIC_KEY_NAME,
    "supabaseApiKey: 'MYEONGHA_SUPABASE_API_KEY'") !== 'canonical_env_name') {
    throw new Error('D3e26 audit self-test missed the public key env contract');
  }
  if (classifyDirectEnvReader(ACCOUNT_DELETION_DISTINCTNESS_ONLY,
    "publicApiKey: 'MYEONGHA_SUPABASE_API_KEY'") !== 'deletion_distinctness_check') {
    throw new Error('D3e26 audit self-test missed account deletion distinctness');
  }
  // Auth proxy consumes the already-declared config binding, not the literal
  // env variable string. A NEW direct literal in it must be re-reviewed.
  if (classifyDirectEnvReader('apps/api/src/supabase-auth-http.ts',
    'const key = process.env.MYEONGHA_SUPABASE_API_KEY') !== 'unreviewed') {
    throw new Error('D3e26 audit self-test wrongly allowed a new Auth proxy env read');
  }
  if (classifyDirectEnvReader('apps/web/unsafe.ts',
    'const key = process.env.MYEONGHA_SUPABASE_API_KEY') !== null) {
    throw new Error('D3e26 audit self-test exceeded the backend API source scope');
  }
  console.log('PASS D3e26: direct Auth key source inventory self-tests');
}

function main() {
  selfTest();
  const { inspected } = inspectAdminPasswordSourceInventory(ROOT);
  const unreviewed = [];
  const canonical = [];
  const distinctness = [];
  for (const file of inspected) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    const classification = classifyDirectEnvReader(file, source);
    if (classification === 'unreviewed') unreviewed.push(file);
    if (classification === 'canonical_env_name') canonical.push(file);
    if (classification === 'deletion_distinctness_check') distinctness.push(file);
  }
  for (const file of unreviewed) {
    // Print only file name. Never print source, config or key bytes.
    console.error('HOLD D3e26: unreviewed Supabase API key env reference: ' + file);
  }

  let drift = false;
  if (canonical.length !== 1 || distinctness.length !== 1) {
    drift = true;
    console.error('HOLD D3e26: canonical key declaration or deletion distinctness missing');
  }
  // This third source is not an admin-key consumer. It uses the public app
  // key ONLY to ensure it cannot equal a SEPARATE account-deletion admin key.
  const deletion = readFileSync(
    resolve(ROOT, ACCOUNT_DELETION_DISTINCTNESS_ONLY), 'utf8',
  );
  for (const expected of [
    "adminSecret: 'MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET'",
    "publicApiKey: 'MYEONGHA_SUPABASE_API_KEY'",
    'value === publicApiKey',
    'must be distinct from the ordinary Supabase API key',
  ]) {
    if (!deletion.includes(expected)) {
      drift = true;
      console.error('HOLD D3e26: account-deletion separate admin/public key boundary changed');
      break;
    }
  }

  for (const file of MUST_GUARD) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    if (!source.includes('isLeastPrivilegeSupabaseAuthApiKeyV1(')) {
      drift = true;
      console.error('HOLD D3e26: least-privilege Supabase API key guard missing: ' + file);
    }
  }
  if (unreviewed.length || drift) {
    process.exitCode = 1;
    return;
  }
  console.log('PASS D3e26: canonical public API key source, separate account-deletion '
    + 'admin/public inequality check, and three Auth guards verified across '
    + inspected.length + ' runtime source files');
  console.log('HOLD D3e26: static source inventory does not verify deployed key class');
}

main();
