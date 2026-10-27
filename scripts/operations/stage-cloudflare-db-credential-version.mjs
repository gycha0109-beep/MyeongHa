// Stage the existing dedicated Cloudflare DB credential as a NEW UNDEPLOYED
// Worker version only. No password generation, DB mutation or Production deploy.
// Watchtower-Track: ops
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { verifyCloudflareDedicatedDbTargetV2, verifyCloudflareDbCredentialConnectionV1 } from './verify-cloudflare-db-credential-connectivity.mjs';

export const STAGED_DB_KEYS_V1 = Object.freeze([
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_DATABASE_PRINCIPAL',
]);
const WRANGLER = '4.151.2';

function failure(code) {
  return Object.freeze({
    result: 'HOLD',
    code,
    deploymentExecuted: false,
    dbPasswordChanged: false,
  });
}
export function prepareCloudflareDbCredentialStageV1(env, config) {
  if (config?.name !== 'myeongha' ||
      config?.workers_dev !== true ||
      config?.main !== './cloudflare/myeongha-worker.mjs') {
    return failure('WRONG_WORKER_CONFIGURATION');
  }
  const check = verifyCloudflareDedicatedDbTargetV2(env);
  if (check.result !== 'CONFIG_CONTRACT_PASS') return failure(check.code);
  if (typeof env.MYEONGHA_DATABASE_URL !== 'string' ||
      typeof env.MYEONGHA_DATABASE_PRINCIPAL !== 'string') {
    return failure('MISSING_DB_SECRETS');
  }
  return Object.freeze({
    result: 'READY_TO_STAGE_UNDEPLOYED',
    code: 'DEDICATED_DB_CONTRACT_VALID',
    deploymentExecuted: false,
    dbPasswordChanged: false,
  });
}
export function buildCloudflareDbCredentialBulkV1(env) {
  // Never serialize this outside of a secured in-process stdin pipe.
  return Object.freeze({
    MYEONGHA_DATABASE_URL: env.MYEONGHA_DATABASE_URL,
    MYEONGHA_DATABASE_PRINCIPAL: env.MYEONGHA_DATABASE_PRINCIPAL,
  });
}
export async function uploadUndeployedDbCredentialV1(values, {
  cwd = process.cwd(),
  spawnImpl = spawn,
} = {}) {
  return new Promise((resolveUpload, rejectUpload) => {
    const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = [
      '--yes', 'wrangler@' + WRANGLER,
      'versions', 'secret', 'bulk',
      '--name', 'myeongha', '--config', 'wrangler.jsonc',
    ];
    const child = spawnImpl(executable, args, {
      cwd, shell: process.platform === 'win32', windowsHide: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    let settled = false;
    const rejectOnce = () => {
      if (settled) return;
      settled = true;
      rejectUpload(new Error('UNDEPLOYED_SECRET_STAGE_FAILED'));
    };
    child.on('error', rejectOnce);
    child.on('close', code => {
      if (settled) return;
      settled = true;
      if (code === 0) resolveUpload();
      else rejectUpload(new Error('UNDEPLOYED_SECRET_STAGE_FAILED'));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(values));
  });
}
export async function stageCloudflareDbCredentialV1({
  env = process.env, cwd = process.cwd(), apply = false,
  readFileImpl = readFile, uploader = uploadUndeployedDbCredentialV1,
  credentialVerifier = verifyCloudflareDbCredentialConnectionV1,
} = {}) {
  let config;
  try {
    config = JSON.parse(await readFileImpl(resolve(cwd, 'wrangler.jsonc'), 'utf8'));
  } catch {
    return failure('WRANGLER_CONFIG_UNAVAILABLE');
  }
  const plan = prepareCloudflareDbCredentialStageV1(env, config);
  if (plan.result !== 'READY_TO_STAGE_UNDEPLOYED' || !apply) return plan;
  try {
    // Never upload a supplied password until it has authenticated through
    // the real TLS peer and been verified as the non-BYPASSRLS CF API role.
    const proof = await credentialVerifier(env);
    if (proof?.result !== 'DB_AUTHENTICATED_READ_ONLY') {
      return failure('DB_CREDENTIAL_READ_ONLY_PROOF_MISSING');
    }
    await uploader(buildCloudflareDbCredentialBulkV1(env), { cwd });
    return Object.freeze({
      result: 'UNDEPLOYED_VERSION_STAGED',
      code: 'DB_SECRET_UPLOAD_REQUESTED',
      deploymentExecuted: false,
      dbPasswordChanged: false,
    });
  } catch {
    return failure('UNDEPLOYED_SECRET_STAGE_FAILED');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply') ||
      args.filter(arg => arg === '--apply').length > 1) {
    process.stdout.write(JSON.stringify(failure('INVALID_ARGUMENTS')) + '\n');
    process.exitCode = 2;
  } else {
    const state = await stageCloudflareDbCredentialV1({ apply: args.includes('--apply') });
    // Print status only. Never print the credential, DSN or uploader output.
    process.stdout.write(JSON.stringify(state) + '\n');
    if (state.result === 'HOLD') process.exitCode = 2;
  }
}
