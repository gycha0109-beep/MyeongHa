import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';

export const SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1 = Object.freeze({
  projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  teamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
  keys: Object.freeze([
    'MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED',
    'MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED',
    'MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED',
    'MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED',
  ]),
  naverSupportKeys: Object.freeze([
    'MYEONGHA_NAVER_CLIENT_ID',
    'MYEONGHA_NAVER_OAUTH_BRIDGE_KEY',
  ]),
});

function targetIsProduction(entry) {
  return Array.isArray(entry?.target) && entry.target.includes('production');
}

export function classifySocialAuthProductionEnvsV1(envs) {
  if (!Array.isArray(envs)) throw new Error('Invalid Vercel environment inventory.');
  const flags = Object.create(null);
  const support = Object.create(null);
  for (const key of SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1.keys) {
    const entries = envs.filter((entry) => entry?.key === key && targetIsProduction(entry));
    if (entries.length === 0) {
      flags[key] = 'missing';
    } else if (entries.length !== 1) {
      flags[key] = 'ambiguous';
    } else if (entries[0].value === 'true') {
      flags[key] = 'enabled';
    } else if (entries[0].value === 'false') {
      flags[key] = 'disabled';
    } else {
      // No decrypted access, protected value, empty value, or unexpected format:
      // fail closed rather than claiming enabled/disabled.
      flags[key] = 'unverified';
    }
  }
  for (const key of SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1.naverSupportKeys) {
    const entries = envs.filter((entry) => entry?.key === key && targetIsProduction(entry));
    support[key] = entries.length === 0 ? 'missing'
      : entries.length === 1 ? 'present'
        : 'ambiguous';
  }
  return Object.freeze({ flags: Object.freeze(flags), support: Object.freeze(support) });
}

/**
 * Read-only inventory using the existing, project-scoped Vercel credential.
 * No POST/PATCH, no credential values, and no upstream payloads in logs.
 */
export async function inspectVercelSocialAuthProductionV1(input) {
  if (input.projectId !== SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1.projectId ||
      input.teamId !== SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1.teamId) {
    throw new Error('Vercel project or team does not match approved MyeongHa identity.');
  }
  if (typeof input.token !== 'string' || input.token.length === 0) {
    throw new Error('Project-scoped Vercel Production inspection credential is unavailable.');
  }
  const url = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(input.projectId)}/env`,
  );
  url.searchParams.set('teamId', input.teamId);
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: 'GET',
    headers: Object.freeze({
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/json',
    }),
  });
  if (!response.ok) {
    throw new Error(`Vercel read-only environment inspection blocked: HTTP ${response.status}`);
  }
  const payload = await response.json();
  return classifySocialAuthProductionEnvsV1(payload?.envs);
}

const invokedAsScript = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const result = await inspectVercelSocialAuthProductionV1({
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID,
    token: process.env.VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN,
  });
  const lines = [
    '## MyeongHa Social Auth Production read-only inspection',
    '',
    'Vercel environment inventory only. Secret values were not emitted.',
    'A flag is reported as enabled only when an explicit true value was readable.',
    'Supabase/provider console configuration and Android OAuth remain unverified.',
    '',
    ...Object.entries(result.flags).map(([key, value]) => `- ${key}: ${value}`),
    ...Object.entries(result.support).map(([key, value]) => `- ${key}: ${value}`),
  ];
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  console.log('social_auth_production_inventory=read_only_complete; credentials_emitted=false');
  for (const [key, value] of Object.entries(result.flags)) {
    console.log(`${key}=${value}`);
  }
  for (const [key, value] of Object.entries(result.support)) {
    console.log(`${key}=${value}`);
  }
}
