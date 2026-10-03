import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const VERCEL_MOBILE_PUSH_REDEPLOY_V1 = Object.freeze({
  projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  teamId: 'team_xuYA9OhCWlJETaYFOmeVodgS',
  productionHost: 'myeongha.vercel.app',
  pollAttempts: 48,
  pollIntervalMs: 5000,
});

function requireNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function vercelJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const raw = await response.text();
  let payload = {};

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      if (!response.ok) {
        throw new Error(
          `Vercel deployment operation failed: status=${response.status} code=NON_JSON_RESPONSE`,
        );
      }
      throw new Error('Vercel deployment operation returned invalid JSON.');
    }
  }

  if (!response.ok) {
    const providerCode =
      typeof payload?.error?.code === 'string'
        ? payload.error.code.slice(0, 120)
        : typeof payload?.code === 'string'
          ? payload.code.slice(0, 120)
          : 'UNKNOWN';
    throw new Error(
      `Vercel deployment operation failed: status=${response.status} code=${providerCode}`,
    );
  }

  return payload;
}

function deploymentState(payload) {
  const value = payload?.readyState ?? payload?.state;
  return typeof value === 'string' ? value.toUpperCase() : '';
}

function requireDeploymentId(payload, label) {
  if (typeof payload?.id !== 'string' || !/^dpl_[A-Za-z0-9]+$/u.test(payload.id)) {
    throw new Error(`${label} did not expose a valid deployment id.`);
  }
  return payload.id;
}

export async function redeployVercelMobilePushProductionV1(input) {
  const token = requireNonEmpty(
    'VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN',
    input.token,
  );
  const projectId = requireNonEmpty('Vercel project id', input.projectId);
  const teamId = requireNonEmpty('Vercel team id', input.teamId);
  const productionHost = requireNonEmpty(
    'Vercel Production host',
    input.productionHost,
  );
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepImpl = input.sleepImpl ?? sleep;
  const pollAttempts =
    Number.isInteger(input.pollAttempts) && input.pollAttempts > 0
      ? input.pollAttempts
      : VERCEL_MOBILE_PUSH_REDEPLOY_V1.pollAttempts;
  const pollIntervalMs =
    Number.isInteger(input.pollIntervalMs) && input.pollIntervalMs >= 0
      ? input.pollIntervalMs
      : VERCEL_MOBILE_PUSH_REDEPLOY_V1.pollIntervalMs;

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  const sourceQuery = new URLSearchParams({ teamId });
  const source = await vercelJson(
    fetchImpl,
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(
      productionHost,
    )}?${sourceQuery}`,
    { headers: authHeaders },
  );
  const sourceId = requireDeploymentId(source, 'Current Production deployment');
  if (deploymentState(source) !== 'READY') {
    throw new Error('Current Vercel Production deployment is not READY.');
  }
  if (source?.target !== undefined && source.target !== 'production') {
    throw new Error('Current Vercel deployment is not the Production target.');
  }
  if (
    typeof source?.projectId === 'string' &&
    source.projectId !== projectId
  ) {
    throw new Error('Current Vercel Production deployment belongs to another project.');
  }

  const createQuery = new URLSearchParams({
    forceNew: '1',
    teamId,
  });
  const created = await vercelJson(
    fetchImpl,
    `https://api.vercel.com/v13/deployments?${createQuery}`,
    {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deploymentId: sourceId,
        target: 'production',
      }),
    },
  );
  const deploymentId = requireDeploymentId(created, 'Redeployed Production deployment');

  let lastState = deploymentState(created);
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (lastState === 'READY') {
      return Object.freeze({
        ready: true,
        deploymentId,
        sourceDeploymentId: sourceId,
        state: 'READY',
      });
    }
    if (['ERROR', 'CANCELED', 'CANCELLED'].includes(lastState)) {
      throw new Error(
        `Vercel Production redeploy entered terminal state ${lastState}.`,
      );
    }

    if (attempt + 1 >= pollAttempts) break;
    await sleepImpl(pollIntervalMs);

    const observed = await vercelJson(
      fetchImpl,
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(
        deploymentId,
      )}?${sourceQuery}`,
      { headers: authHeaders },
    );
    requireDeploymentId(observed, 'Observed Production deployment');
    lastState = deploymentState(observed);
  }

  throw new Error(
    `Vercel Production redeploy did not become READY within ${pollAttempts} observations; last_state=${
      lastState || 'UNKNOWN'
    }.`,
  );
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedAsScript) {
  const result = await redeployVercelMobilePushProductionV1({
    token: process.env.VERCEL_MOBILE_PUSH_ACTIVATION_TOKEN,
    projectId:
      process.env.VERCEL_PROJECT_ID ??
      VERCEL_MOBILE_PUSH_REDEPLOY_V1.projectId,
    teamId:
      process.env.VERCEL_TEAM_ID ??
      VERCEL_MOBILE_PUSH_REDEPLOY_V1.teamId,
    productionHost:
      process.env.VERCEL_PRODUCTION_HOST ??
      VERCEL_MOBILE_PUSH_REDEPLOY_V1.productionHost,
  });

  console.log(
    `vercel_mobile_push_redeploy=pass deployment_id=${result.deploymentId} state=${result.state} credential_values_emitted=false`,
  );
}
