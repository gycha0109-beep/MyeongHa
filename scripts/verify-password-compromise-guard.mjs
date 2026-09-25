import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const paths = {
  guard: 'apps/api/src/breached-password-guard.ts',
  auth: 'apps/api/src/supabase-auth-http.ts',
  productAuth: 'apps/web/product-auth.js',
  authPage: 'apps/web/auth-page.js',
  vercel: 'vercel.json',
  authority: 'docs/operations/PASSWORD_COMPROMISE_GUARD_V1.md',
  productionCanaryWorkflow: '.github/workflows/production-password-compromise-guard-evidence.yml',
  productionCanary: 'scripts/operations/verify-production-password-compromise-guard-live.mjs',
};

const entries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
);
const files = Object.fromEntries(entries);

function requireFragment(key, fragment) {
  if (!files[key].includes(fragment)) {
    throw new Error(`${paths[key]} is missing Password Compromise Guard authority fragment: ${fragment}`);
  }
}

function forbidFragment(key, fragment) {
  if (files[key].includes(fragment)) {
    throw new Error(`${paths[key]} contains forbidden Password Compromise Guard fragment: ${fragment}`);
  }
}

for (const fragment of [
  "const HIBP_PWNED_PASSWORDS_ORIGIN = 'https://api.pwnedpasswords.com'",
  'const HIBP_RANGE_PREFIX_LENGTH = 5',
  'const HIBP_RESPONSE_MAX_BYTES = 512 * 1024',
  'const HIBP_REQUEST_TIMEOUT_MS = 3_000',
  "'Add-Padding': 'true'",
  "'User-Agent': 'MyeongHa-Password-Compromise-Guard/1.0'",
  "cache: 'no-store'",
  "redirect: 'error'",
  ".update(password, 'utf8')",
  '.slice(0, HIBP_RANGE_PREFIX_LENGTH)',
  '.slice(HIBP_RANGE_PREFIX_LENGTH)',
  "status: 'unavailable'",
]) requireFragment('guard', fragment);

for (const fragment of [
  "input.action === 'sign-up'",
  "return errorResponse('COMPROMISED_PASSWORD', 422)",
  "return errorResponse('PASSWORD_SECURITY_UNAVAILABLE', 503)",
  "input.action === 'sign-in'",
  "return errorResponse('COMPROMISED_PASSWORD', 403)",
  "await callSupabase(config, '/auth/v1/logout'",
  "passwordCompromiseCheck: compromiseCheck.status",
]) requireFragment('auth', fragment);

const signupGuardIndex = files.auth.indexOf("if (input.action === 'sign-up')");
const authUpstreamPathIndex = files.auth.indexOf("const path = input.action === 'sign-in'");
if (signupGuardIndex < 0 || authUpstreamPathIndex < 0 || signupGuardIndex >= authUpstreamPathIndex) {
  throw new Error('Compromised-password sign-up guard must execute before the Supabase Auth sign-up call.');
}

for (const fragment of [
  "postJson('/api/auth/sign-in'",
  "postJson('/api/auth/sign-up'",
]) requireFragment('productAuth', fragment);

for (const fragment of [
  "case 'COMPROMISED_PASSWORD':",
  "case 'PASSWORD_SECURITY_UNAVAILABLE':",
]) requireFragment('authPage', fragment);

requireFragment('vercel', '"value": "default-src \'self\'; base-uri \'self\'; object-src \'none\'; frame-ancestors \'none\'; form-action \'self\'; img-src \'self\' data:; font-src \'self\'; style-src \'self\'; script-src \'self\'; connect-src \'self\'"');

for (const fragment of [
  'workflow_dispatch:',
  "default: ops",
  "environment: production",
  "MYEONGHA_PASSWORD_COMPROMISE_CANARY_CONFIRM: ${{ inputs.confirmation }}",
  "MYEONGHA_WATCHTOWER_TRACK: ${{ inputs.watchtower_track }}",
  "node scripts/operations/verify-production-password-compromise-guard-live.mjs",
]) requireFragment('productionCanaryWorkflow', fragment);

for (const fragment of [
  "const PRODUCTION_SIGNUP_ENDPOINT = 'https://myeongha.vercel.app/api/auth/sign-up'",
  "const EXPECTED_STATUS = 422",
  "const EXPECTED_ERROR_CODE = 'COMPROMISED_PASSWORD'",
  "const compromisedPassword = ['123', '456'].join('')",
  "process.env.GITHUB_REF !== 'refs/heads/main'",
  "process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'",
  "containsForbiddenSessionMaterial(payload)",
  "serializedPayload.includes(compromisedPassword)",
  "console.log('password_compromise_guard_evidence=pass')",
  "console.log('plaintext_password_logged=false')",
  "console.log('full_password_hash_logged=false')",
  "console.log('session_material_returned=false')",
]) requireFragment('productionCanary', fragment);

for (const fragment of [
  'actions/upload-artifact',
  'set -x',
  'secrets.',
]) forbidFragment('productionCanaryWorkflow', fragment);

for (const fragment of [
  'console.log(compromisedPassword',
  'console.error(compromisedPassword',
  'console.log(payload',
  'console.error(payload',
  'console.log(serializedPayload',
  'console.error(serializedPayload',
  'createHash(',
]) forbidFragment('productionCanary', fragment);

for (const fragment of [
  'Status: **APPROVED IMPLEMENTATION AUTHORITY**',
  'HIBP Pwned Passwords Range API',
  'first 5 hexadecimal characters of SHA-1(password)',
  'persist plaintext passwords or complete password hashes',
  'fail closed',
  'passwordCompromiseCheck = unavailable',
  'There is no active MyeongHa password-change endpoint',
  "CSP      -> connect-src 'self'",
]) requireFragment('authority', fragment);

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(path));
    else result.push(path);
  }
  return result;
}

const webFiles = await collectFiles('apps/web');
for (const path of webFiles) {
  if (!/\.(?:js|ts|tsx|html)$/u.test(path)) continue;
  const source = await readFile(path, 'utf8');
  if (
    source.includes('api.pwnedpasswords.com')
    || source.includes('/auth/v1/token?grant_type=password')
    || source.includes('/auth/v1/signup')
  ) {
    throw new Error(`${path} bypasses the same-origin MyeongHa Password Compromise Guard boundary.`);
  }
}

forbidFragment('guard', 'console.log(password');
forbidFragment('guard', 'console.error(password');
forbidFragment('auth', 'console.log(password');
forbidFragment('auth', 'console.error(password');

console.log(
  'MyeongHa Password Compromise Guard v1 verification passed: HIBP prefix-5-only disclosure, bounded provider I/O, fail-closed signup, compromised-session withholding, availability-preserving sign-in provider outage, and same-origin browser Auth are pinned.',
);
