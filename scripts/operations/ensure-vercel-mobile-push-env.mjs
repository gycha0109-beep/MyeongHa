import { randomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1 = Object.freeze({
  projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  teamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
  requiredKeys: Object.freeze([
    'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
    'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
  ]),
  requiredType: 'sensitive',
  target: 'production',
});

function requireNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function targetsOf(entry) {
  return Array.isArray(entry?.target)
    ? entry.target.filter((value) => typeof value === 'string')
    : [];
}

function productionEntryForKey(envs, key) {
  const matches = envs.filter(
    (entry) =>
      entry?.key === key &&
      targetsOf(entry).includes(
        VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.target,
      ),
  );
  if (matches.length > 1) {
    throw new Error(`Vercel environment key ${key} has ambiguous Production bindings.`);
  }
  return matches[0] ?? null;
}

async function vercelJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    let providerCode = 'UNKNOWN';
    try {
      const payload = await response.json();
      if (typeof payload?.error?.code === 'string') {
        providerCode = payload.error.code.slice(0, 120);
      }
    } catch {
      // Do not echo provider bodies because they may contain credential-adjacent data.
    }
    throw new Error(
      `Vercel environment operation failed: status=${response.status} code=${providerCode}`,
    );
  }
  return response.json();
}

async function listProjectEnvs(input) {
  const query = new URLSearchParams({ teamId: input.teamId });
  const payload = await vercelJson(
    input.fetchImpl,
    `https://api.vercel.com/v9/projects/${encodeURIComponent(input.projectId)}/env?${query}`,
    {
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: 'application/json',
      },
    },
  );
  if (!Array.isArray(payload?.envs)) {
    throw new Error('Vercel environment list response is missing envs[].');
  }
  return payload.envs;
}

async function createSensitiveProductionEnv(input, key) {
  const value = randomBytes(48).toString('base64url');
  const query = new URLSearchParams({
    upsert: 'true',
    teamId: input.teamId,
  });
  await vercelJson(
    input.fetchImpl,
    `https://api.vercel.com/v10/projects/${encodeURIComponent(input.projectId)}/env?${query}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key,
        value,
        type: VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.requiredType,
        target: [VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.target],
        comment: 'MyeongHa Mobile Push token protection v1',
      }),
    },
  );
}

export async function ensureVercelMobilePushSecretsV1(input) {
  const token = requireNonEmpty('VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN', input.token);
  const projectId = requireNonEmpty('Vercel project id', input.projectId);
  const teamId = requireNonEmpty('Vercel team id', input.teamId);
  const fetchImpl = input.fetchImpl ?? fetch;

  const request = { token, projectId, teamId, fetchImpl };
  const before = await listProjectEnvs(request);
  const created = [];

  for (const key of VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.requiredKeys) {
    const existing = productionEntryForKey(before, key);
    if (existing !== null) {
      if (existing.type !== VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.requiredType) {
        throw new Error(
          `Vercel Production environment key ${key} must use sensitive type.`,
        );
      }
      continue;
    }
    await createSensitiveProductionEnv(request, key);
    created.push(key);
  }

  const after = await listProjectEnvs(request);
  for (const key of VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.requiredKeys) {
    const entry = productionEntryForKey(after, key);
    if (entry === null) {
      throw new Error(`Vercel Production environment key ${key} is still absent.`);
    }
    if (entry.type !== VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.requiredType) {
      throw new Error(
        `Vercel Production environment key ${key} is not sensitive after provisioning.`,
      );
    }
  }

  return Object.freeze({
    ready: true,
    created: Object.freeze([...created]),
    present: VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.requiredKeys,
  });
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const result = await ensureVercelMobilePushSecretsV1({
    token: process.env.VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN,
    projectId:
      process.env.VERCEL_PROJECT_ID ??
      VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.projectId,
    teamId:
      process.env.VERCEL_TEAM_ID ??
      VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1.teamId,
  });
  console.log(
    `vercel_mobile_push_secret_names=pass created=${
      result.created.length === 0 ? 'none' : result.created.join(',')
    } values_emitted=false`,
  );
}
