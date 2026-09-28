import { spawn } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import {
  buildAutomationBypassCanaryHeaders,
  buildTemporaryCanaryAlias,
  inspectAutomationBypassBinding,
  inspectSkipDomainAliasEvidence,
  inspectTemporaryCanaryAliasEvidence,
  resolveAllowedCanaryRedirect,
} from './run-production-postgres-tls-peer-canary-orchestrator.mjs';

const PROJECT_ID = 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
const TEAM_ID = 'team_xuYA9OhCWlJETaYFOmeVodgS';
const PROJECT_NAME = 'myeongha';
const TRACK = 'security';
const VERCEL_CLI_PACKAGE = 'vercel@59.16.0';
const CANARY_MODE = 'one-shot-b3';
const ROOT_CERT_ENV_KEY = 'MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM';
const PEER_MODE_ENV_KEY = 'MYEONGHA_DATABASE_TLS_PEER_MODE';
const CANONICAL_PRODUCTION_HOST = 'myeongha.vercel.app';
const PINNED_ROOT_FINGERPRINT256 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
const AUTHORITY_PATH =
  'config/operations/production-postgres-tls-peer-verification-v1.json';
const ONE_SHOT_MARKER_PATH =
  'config/operations/run-once/production-postgres-tls-b3-activation.marker';
const ONE_SHOT_MARKER_VALUE =
  'ACTIVATE_POSTGRES_TLS_VERIFY_FULL_B3_RUN1';

class ActivationOrchestratorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ActivationOrchestratorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ActivationOrchestratorError(code, message);
}

function required(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, 'Required activation input is missing.');
  }
  return value.trim();
}

function requireAuthority(env) {
  if (
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.MYEONGHA_WATCHTOWER_TRACK !== TRACK
  ) {
    return fail(
      'ACTIVATION_AUTHORITY_INVALID',
      'Production PostgreSQL TLS activation authority is invalid.',
    );
  }

  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (env.DISPATCH_CONFIRM !== 'ACTIVATE_POSTGRES_TLS_VERIFY_FULL_B3') {
      return fail(
        'ACTIVATION_AUTHORITY_INVALID',
        'Production PostgreSQL TLS activation dispatch confirmation is invalid.',
      );
    }
    return;
  }

  if (env.GITHUB_EVENT_NAME === 'push') {
    if (env.MYEONGHA_POSTGRES_TLS_B3_MARKER_PATH !== ONE_SHOT_MARKER_PATH) {
      return fail(
        'ACTIVATION_MARKER_AUTHORITY_INVALID',
        'Production PostgreSQL TLS activation marker authority is invalid.',
      );
    }

    let marker;
    try {
      marker = readFileSync(ONE_SHOT_MARKER_PATH, 'utf8');
    } catch {
      return fail(
        'ACTIVATION_MARKER_MISSING',
        'Production PostgreSQL TLS activation marker is missing.',
      );
    }

    if (marker !== ONE_SHOT_MARKER_VALUE) {
      return fail(
        'ACTIVATION_MARKER_INVALID',
        'Production PostgreSQL TLS activation marker value is invalid.',
      );
    }
    return;
  }

  return fail(
    'ACTIVATION_AUTHORITY_INVALID',
    'Production PostgreSQL TLS activation event is invalid.',
  );
}

async function requestJson(url, token, init, code) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return fail(code, 'Vercel API request failed.');
  }

  if (!response.ok) {
    return fail(code, `Vercel API request rejected with status ${response.status}.`);
  }

  try {
    return await response.json();
  } catch {
    return fail(code, 'Vercel API response was not JSON.');
  }
}

function loadPinnedFingerprint() {
  let authority;
  try {
    authority = JSON.parse(readFileSync(AUTHORITY_PATH, 'utf8'));
  } catch {
    return fail(
      'ACTIVATION_AUTHORITY_FILE_INVALID',
      'TLS peer-verification authority file is invalid.',
    );
  }
  const fingerprint =
    authority?.rootCertificateAuthority?.productionFingerprint256;
  if (
    typeof fingerprint !== 'string' ||
    !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u.test(fingerprint) ||
    fingerprint !== PINNED_ROOT_FINGERPRINT256
  ) {
    return fail(
      'ACTIVATION_FINGERPRINT_AUTHORITY_INVALID',
      'Pinned Production root fingerprint authority is invalid.',
    );
  }
  return fingerprint;
}

function validateRootCertificate(rootCertificatePem, fingerprint) {
  const normalized = rootCertificatePem.trim();
  if (
    normalized.includes('-----BEGIN PRIVATE KEY-----') ||
    normalized.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----') ||
    normalized.includes('-----BEGIN RSA PRIVATE KEY-----') ||
    normalized.includes('-----BEGIN EC PRIVATE KEY-----')
  ) {
    return fail(
      'ACTIVATION_ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
      'Production root certificate material must not contain a private key.',
    );
  }

  let certificate;
  try {
    certificate = new X509Certificate(normalized);
  } catch {
    return fail(
      'ACTIVATION_ROOT_CERTIFICATE_INVALID',
      'Production root certificate is not valid X.509 material.',
    );
  }

  if (certificate.fingerprint256 !== fingerprint) {
    return fail(
      'ACTIVATION_ROOT_CERTIFICATE_FINGERPRINT_MISMATCH',
      'Production root certificate does not match pinned authority.',
    );
  }
}

export function buildProductionEnvPayload(input) {
  return [
    {
      key: ROOT_CERT_ENV_KEY,
      value: input.rootCertificatePem,
      type: 'sensitive',
      target: ['production'],
      comment: 'MyeongHa SEC-01 governed Supabase Server root certificate',
    },
    {
      key: PEER_MODE_ENV_KEY,
      value: input.peerMode,
      type: 'encrypted',
      target: ['production'],
      comment: 'MyeongHa SEC-01 PostgreSQL TLS peer-verification mode',
    },
  ];
}

async function upsertProductionEnvBindings(input) {
  const payload = buildProductionEnvPayload(input);
  const result = await requestJson(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(PROJECT_ID)}/env?upsert=true&teamId=${encodeURIComponent(TEAM_ID)}`,
    input.vercelToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'ACTIVATION_ENV_UPSERT_FAILED',
  );

  if (Array.isArray(result?.failed) && result.failed.length !== 0) {
    return fail(
      'ACTIVATION_ENV_UPSERT_REJECTED',
      'Vercel rejected one or more Production TLS bindings.',
    );
  }

  const metadata = await requestJson(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(PROJECT_ID)}/env?teamId=${encodeURIComponent(TEAM_ID)}`,
    input.vercelToken,
    { method: 'GET' },
    'ACTIVATION_ENV_METADATA_LOOKUP_FAILED',
  );

  const envs = Array.isArray(metadata?.envs) ? metadata.envs : [];
  const rootBindings = envs.filter(
    (entry) =>
      entry?.key === ROOT_CERT_ENV_KEY &&
      entry?.type === 'sensitive' &&
      Array.isArray(entry?.target) &&
      entry.target.includes('production'),
  );
  const modeBindings = envs.filter(
    (entry) =>
      entry?.key === PEER_MODE_ENV_KEY &&
      entry?.type === 'encrypted' &&
      Array.isArray(entry?.target) &&
      entry.target.includes('production'),
  );

  if (rootBindings.length !== 1 || modeBindings.length !== 1) {
    return fail(
      'ACTIVATION_ENV_METADATA_INVALID',
      'Production TLS binding metadata did not match the governed contract.',
    );
  }

  return Object.freeze({
    rootCertificateSensitiveBinding: true,
    peerModeEncryptedBinding: true,
    envValueRead: false,
  });
}

async function verifyGovernedVercelProject(input) {
  const project = await requestJson(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(PROJECT_ID)}?teamId=${encodeURIComponent(TEAM_ID)}`,
    input.vercelToken,
    { method: 'GET' },
    'ACTIVATION_PROJECT_LOOKUP_FAILED',
  );
  if (project?.id !== PROJECT_ID || project?.name !== PROJECT_NAME) {
    return fail(
      'ACTIVATION_PROJECT_MISMATCH',
      'Vercel Production project identity did not match governance.',
    );
  }
  return inspectAutomationBypassBinding(
    project,
    input.automationBypassSecret,
  );
}

function boundedAppend(current, chunk) {
  const next = current + chunk.toString('utf8');
  return next.length > 65_536 ? next.slice(-65_536) : next;
}

export function buildActivationSkipDomainDeploymentArgs(input) {
  return [
    '--yes',
    VERCEL_CLI_PACKAGE,
    'deploy',
    '.',
    '--prod',
    '--skip-domain',
    '--yes',
    '--env',
    `${PEER_MODE_ENV_KEY}=verify-full`,
    '--env',
    `MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_TOKEN=${input.canaryToken}`,
    '--env',
    `MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_MODE=${CANARY_MODE}`,
    '--env',
    `MYEONGHA_POSTGRES_TLS_ACTIVATION_CANARY_SHA=${input.githubSha}`,
    '--meta',
    `myeonghaTlsB3Sha=${input.githubSha}`,
  ];
}

function classifyVercelCliFailure(stderr) {
  const normalized = stderr.toLowerCase();
  if (normalized.includes('unauthorized') || normalized.includes('invalid token')) {
    return 'ACTIVATION_DEPLOYMENT_AUTH_FAILED';
  }
  if (normalized.includes('build failed') || normalized.includes('build error')) {
    return 'ACTIVATION_DEPLOYMENT_BUILD_FAILED';
  }
  return 'ACTIVATION_DEPLOYMENT_CREATE_FAILED';
}

function runSkipDomainDeployment(input) {
  return new Promise((resolvePromise, rejectPromise) => {
    const childEnv = { ...process.env };
    delete childEnv.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM;
    childEnv.VERCEL_TOKEN = input.vercelToken;
    childEnv.VERCEL_ORG_ID = TEAM_ID;
    childEnv.VERCEL_PROJECT_ID = PROJECT_ID;

    const child = spawn(
      'npx',
      buildActivationSkipDomainDeploymentArgs(input),
      {
        cwd: process.cwd(),
        env: childEnv,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = boundedAppend(stderr, chunk);
    });

    const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000);

    child.once('error', () => {
      clearTimeout(timeout);
      rejectPromise(
        new ActivationOrchestratorError(
          'ACTIVATION_DEPLOYMENT_CREATE_FAILED',
          'Vercel staged activation deployment failed to start.',
        ),
      );
    });

    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0 || signal !== null) {
        rejectPromise(
          new ActivationOrchestratorError(
            classifyVercelCliFailure(stderr),
            'Vercel staged activation deployment failed.',
          ),
        );
        return;
      }

      const urls =
        stdout.match(/https:\/\/[a-z0-9][a-z0-9.-]*[.]vercel[.]app/giu) ?? [];
      const deploymentUrl = urls.at(-1);
      if (deploymentUrl === undefined || stderr.includes('Error:')) {
        rejectPromise(
          new ActivationOrchestratorError(
            'ACTIVATION_DEPLOYMENT_URL_MISSING',
            'Staged activation deployment did not return a deployment URL.',
          ),
        );
        return;
      }
      resolvePromise(deploymentUrl);
    });
  });
}

async function assignTemporaryAlias(input) {
  const aliasLookup = await fetch(
    `https://api.vercel.com/v4/aliases/${encodeURIComponent(input.alias)}?teamId=${encodeURIComponent(TEAM_ID)}`,
    {
      headers: {
        Authorization: `Bearer ${input.vercelToken}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (aliasLookup.status !== 404) {
    return fail(
      'ACTIVATION_TEMP_ALIAS_UNAVAILABLE',
      'Temporary activation alias is not available.',
    );
  }

  const payload = await requestJson(
    `https://api.vercel.com/v2/deployments/${encodeURIComponent(input.deploymentId)}/aliases?teamId=${encodeURIComponent(TEAM_ID)}`,
    input.vercelToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: input.alias, redirect: null }),
    },
    'ACTIVATION_TEMP_ALIAS_ASSIGN_FAILED',
  );
  if (
    typeof payload?.uid !== 'string' ||
    payload?.alias !== input.alias ||
    payload?.oldDeploymentId !== undefined
  ) {
    return fail(
      'ACTIVATION_TEMP_ALIAS_ASSIGN_INVALID',
      'Temporary activation alias response was invalid.',
    );
  }
  return payload.uid;
}

async function deleteTemporaryAlias(aliasUid, token) {
  if (!aliasUid) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.vercel.com/v2/aliases/${encodeURIComponent(aliasUid)}?teamId=${encodeURIComponent(TEAM_ID)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (response.ok || response.status === 404) return true;
    } catch {
      // Retry below.
    }
    if (attempt < 2) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, 500 * (attempt + 1)),
      );
    }
  }
  return false;
}

async function deleteDeployment(id, token) {
  if (!id) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(TEAM_ID)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (response.ok || response.status === 404) return true;
    } catch {
      // Retry below.
    }
    if (attempt < 2) {
      await new Promise((resolvePromise) =>
        setTimeout(resolvePromise, 500 * (attempt + 1)),
      );
    }
  }
  return false;
}

async function runActivationCanaryRequest(input) {
  const headers = buildAutomationBypassCanaryHeaders({
    canaryToken: input.canaryToken,
    automationBypassSecret: input.automationBypassSecret,
  });
  const firstRequestUrl = `${input.requestBaseUrl}/api/readiness`;

  let response = await fetch(firstRequestUrl, {
    method: 'POST',
    headers,
    body: '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });

  if (response.status >= 300 && response.status < 400) {
    const redirectUrl = resolveAllowedCanaryRedirect({
      status: response.status,
      location: response.headers.get('location'),
      requestUrl: firstRequestUrl,
      deploymentUrl: input.deploymentUrl,
    });
    response = await fetch(redirectUrl, {
      method: 'POST',
      headers,
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return fail(
      'ACTIVATION_CANARY_RESPONSE_INVALID',
      'Activation canary response was not JSON.',
    );
  }

  if (
    payload?.status === 'fail' &&
    typeof payload?.code === 'string' &&
    /^[A-Z0-9_]+$/u.test(payload.code)
  ) {
    return fail(
      `ACTIVATION_ENDPOINT_${payload.code}`,
      'Activation canary endpoint reported a fail-closed result.',
    );
  }

  if (!response.ok) {
    return fail(
      'ACTIVATION_CANARY_REQUEST_REJECTED',
      'Activation canary request was rejected.',
    );
  }
  return payload;
}

export function validateActivationCanaryEvidence(payload) {
  const evidence = payload?.evidence;
  if (
    payload?.status !== 'pass' ||
    evidence?.schemaVersion !==
      'myeongha-production-postgres-tls-activation-canary-v1' ||
    evidence?.deploymentTarget !== 'production' ||
    evidence?.oneShotGitShaConfigured !== true ||
    evidence?.runtimeTlsMode !== 'verify-full' ||
    evidence?.runtimePeerVerification !== 'full' ||
    evidence?.rejectUnauthorized !== true ||
    evidence?.defaultHostnameVerification !== true ||
    evidence?.rootCertificateConfigured !== true ||
    evidence?.rootCertificateFingerprint256 !== PINNED_ROOT_FINGERPRINT256 ||
    evidence?.ordinaryPoolConnectionSucceeded !== true ||
    evidence?.transactionReadOnly !== true ||
    evidence?.principalExpected !== 'myeongha_runtime' ||
    evidence?.principalMatch !== true ||
    evidence?.executionRole !== 'myeongha_api_executor' ||
    evidence?.executionRoleMembership !== true ||
    evidence?.writeExecuted !== false ||
    evidence?.databaseUrlEmitted !== false ||
    evidence?.credentialMaterialEmitted !== false ||
    evidence?.rootCertificatePemEmitted !== false
  ) {
    return fail(
      'ACTIVATION_CANARY_EVIDENCE_INVALID',
      'Activation canary evidence did not satisfy the governed contract.',
    );
  }
  return evidence;
}

async function findExactMainProductionDeployment(input) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const payload = await requestJson(
      `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&target=production&limit=20&teamId=${encodeURIComponent(TEAM_ID)}`,
      input.vercelToken,
      { method: 'GET' },
      'ACTIVATION_SOURCE_DEPLOYMENT_LOOKUP_FAILED',
    );
    const matches = (payload?.deployments ?? []).filter(
      (deployment) =>
        deployment?.meta?.githubCommitSha === input.githubSha &&
        deployment?.meta?.myeonghaTlsB3Sha === undefined &&
        deployment?.target === 'production' &&
        (deployment?.state === 'READY' || deployment?.readyState === 'READY'),
    );
    const source = matches.sort(
      (left, right) => (left?.created ?? 0) - (right?.created ?? 0),
    ).at(-1);
    if (
      typeof source?.uid === 'string' &&
      source?.name === PROJECT_NAME
    ) {
      return Object.freeze({ id: source.uid, name: source.name });
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  return fail(
    'ACTIVATION_SOURCE_DEPLOYMENT_MISSING',
    'Exact-main Production source deployment was not available.',
  );
}

async function requestExactRedeploy(input) {
  const payload = await requestJson(
    `https://api.vercel.com/v13/deployments?forceNew=1&teamId=${encodeURIComponent(TEAM_ID)}`,
    input.vercelToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deploymentId: input.sourceId,
        meta: {
          action: 'redeploy',
          myeonghaTlsB3ActivationSha: input.githubSha,
        },
        name: PROJECT_NAME,
        target: 'production',
      }),
    },
    'ACTIVATION_REDEPLOY_CREATE_FAILED',
  );
  const id = payload?.id ?? payload?.uid;
  if (typeof id !== 'string' || id.length === 0) {
    return fail(
      'ACTIVATION_REDEPLOY_ID_MISSING',
      'Production activation redeploy id was missing.',
    );
  }
  return id;
}

async function waitRedeployReady(input) {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const deployment = await requestJson(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(input.deploymentId)}?teamId=${encodeURIComponent(TEAM_ID)}`,
      input.vercelToken,
      { method: 'GET' },
      'ACTIVATION_REDEPLOY_STATUS_FAILED',
    );
    const state =
      deployment?.readyState ?? deployment?.state ?? deployment?.status;
    if (state === 'READY') {
      if (
        deployment?.projectId !== PROJECT_ID ||
        deployment?.target !== 'production' ||
        deployment?.meta?.githubCommitSha !== input.githubSha ||
        deployment?.meta?.action !== 'redeploy' ||
        deployment?.meta?.myeonghaTlsB3ActivationSha !== input.githubSha
      ) {
        return fail(
          'ACTIVATION_REDEPLOY_SOURCE_UNVERIFIED',
          'Production activation redeploy did not prove exact governed source.',
        );
      }
      return deployment;
    }
    if (state === 'ERROR' || state === 'CANCELED') {
      return fail(
        'ACTIVATION_REDEPLOY_FAILED',
        'Production activation redeploy entered a terminal failure state.',
      );
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  return fail(
    'ACTIVATION_REDEPLOY_TIMEOUT',
    'Production activation redeploy did not become ready in time.',
  );
}

async function verifyCanonicalAliasAndReadiness(input) {
  const deadline = Date.now() + 180_000;
  let aliases;
  while (Date.now() < deadline) {
    aliases = await requestJson(
      `https://api.vercel.com/v2/deployments/${encodeURIComponent(input.deploymentId)}/aliases?teamId=${encodeURIComponent(TEAM_ID)}`,
      input.vercelToken,
      { method: 'GET' },
      'ACTIVATION_CANONICAL_ALIAS_LOOKUP_FAILED',
    );
    if (
      Array.isArray(aliases?.aliases) &&
      aliases.aliases.some(
        (entry) => entry?.alias === CANONICAL_PRODUCTION_HOST,
      )
    ) {
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }

  if (
    !Array.isArray(aliases?.aliases) ||
    !aliases.aliases.some(
      (entry) => entry?.alias === CANONICAL_PRODUCTION_HOST,
    )
  ) {
    return fail(
      'ACTIVATION_CANONICAL_ALIAS_MISSING',
      'Exact activation redeploy did not receive the canonical Production alias.',
    );
  }

  const response = await fetch(
    `https://${CANONICAL_PRODUCTION_HOST}/api/readiness`,
    {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    return fail(
      'ACTIVATION_CANONICAL_READINESS_REJECTED',
      'Canonical Production readiness request was rejected.',
    );
  }
  const report = await response.json();
  if (
    report?.status !== 'ready' ||
    report?.capabilities?.userData !== 'ready' ||
    report?.capabilities?.sajuCalculation !== 'ready'
  ) {
    return fail(
      'ACTIVATION_CANONICAL_READINESS_INVALID',
      'Canonical Production readiness did not satisfy the governed baseline.',
    );
  }
  return true;
}

async function activateCanonicalProduction(input) {
  const source = await findExactMainProductionDeployment(input);
  const redeployId = await requestExactRedeploy({
    ...input,
    sourceId: source.id,
  });
  await waitRedeployReady({
    ...input,
    deploymentId: redeployId,
  });
  await verifyCanonicalAliasAndReadiness({
    ...input,
    deploymentId: redeployId,
  });
  return redeployId;
}

async function rollbackToLegacy(input) {
  try {
    await upsertProductionEnvBindings({
      vercelToken: input.vercelToken,
      rootCertificatePem: input.rootCertificatePem,
      peerMode: 'legacy',
    });
    await activateCanonicalProduction({
      vercelToken: input.vercelToken,
      githubSha: input.githubSha,
    });
    console.log('production_tls_b3_rollback=pass');
    return true;
  } catch {
    console.log('production_tls_b3_rollback=failed');
    return false;
  }
}

export async function runProductionPostgresTlsB3Activation(env = process.env) {
  requireAuthority(env);

  const vercelToken = required(env.VERCEL_TOKEN, 'VERCEL_TOKEN_MISSING');
  const automationBypassSecret = required(
    env.VERCEL_AUTOMATION_BYPASS_SECRET,
    'VERCEL_AUTOMATION_BYPASS_SECRET_MISSING',
  );
  const rootCertificatePem = required(
    env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
    'ROOT_CERTIFICATE_MISSING',
  );
  const githubSha = required(env.GITHUB_SHA, 'GITHUB_SHA_MISSING');
  if (!/^[0-9a-f]{40}$/u.test(githubSha)) {
    return fail('GITHUB_SHA_INVALID', 'Governed Git SHA is invalid.');
  }

  const pinnedFingerprint = loadPinnedFingerprint();
  validateRootCertificate(rootCertificatePem, pinnedFingerprint);

  const canaryToken = randomBytes(32).toString('base64url');
  const bypassEvidence = await verifyGovernedVercelProject({
    vercelToken,
    automationBypassSecret,
  });

  let stagedDeploymentId;
  let temporaryAliasUid;
  let persistentVerifyFullBound = false;

  try {
    const legacyBindingEvidence = await upsertProductionEnvBindings({
      vercelToken,
      rootCertificatePem,
      peerMode: 'legacy',
    });

    const deploymentUrl = await runSkipDomainDeployment({
      vercelToken,
      canaryToken,
      githubSha,
    });
    const hostname = new URL(deploymentUrl).hostname;
    const deployment = await requestJson(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}?teamId=${encodeURIComponent(TEAM_ID)}`,
      vercelToken,
      { method: 'GET' },
      'ACTIVATION_STAGED_DEPLOYMENT_LOOKUP_FAILED',
    );

    if (
      typeof deployment?.id !== 'string' ||
      deployment?.readyState !== 'READY' ||
      deployment?.meta?.myeonghaTlsB3Sha !== githubSha ||
      deployment?.meta?.githubCommitSha !== githubSha
    ) {
      return fail(
        'ACTIVATION_STAGED_SOURCE_UNVERIFIED',
        'Staged activation deployment did not prove exact governed source.',
      );
    }
    stagedDeploymentId = deployment.id;

    const aliases = await requestJson(
      `https://api.vercel.com/v2/deployments/${encodeURIComponent(stagedDeploymentId)}/aliases?teamId=${encodeURIComponent(TEAM_ID)}`,
      vercelToken,
      { method: 'GET' },
      'ACTIVATION_STAGED_ALIAS_LOOKUP_FAILED',
    );
    const skipDomainEvidence = inspectSkipDomainAliasEvidence(aliases);

    const temporaryAlias = buildTemporaryCanaryAlias({
      githubRunId: env.GITHUB_RUN_ID,
    });
    temporaryAliasUid = await assignTemporaryAlias({
      deploymentId: stagedDeploymentId,
      alias: temporaryAlias,
      vercelToken,
    });

    const aliasesAfter = await requestJson(
      `https://api.vercel.com/v2/deployments/${encodeURIComponent(stagedDeploymentId)}/aliases?teamId=${encodeURIComponent(TEAM_ID)}`,
      vercelToken,
      { method: 'GET' },
      'ACTIVATION_TEMP_ALIAS_VERIFY_LOOKUP_FAILED',
    );
    const temporaryAliasEvidence = inspectTemporaryCanaryAliasEvidence(
      aliasesAfter,
      temporaryAlias,
      temporaryAliasUid,
    );

    const payload = await runActivationCanaryRequest({
      requestBaseUrl: `https://${temporaryAlias}`,
      deploymentUrl,
      canaryToken,
      automationBypassSecret,
    });
    const canaryEvidence = validateActivationCanaryEvidence(payload);

    await upsertProductionEnvBindings({
      vercelToken,
      rootCertificatePem,
      peerMode: 'verify-full',
    });
    persistentVerifyFullBound = true;

    const canonicalRedeployId = await activateCanonicalProduction({
      vercelToken,
      githubSha,
    });

    return Object.freeze({
      schemaVersion:
        'myeongha-production-postgres-tls-b3-activation-orchestration-v1',
      ...legacyBindingEvidence,
      ...skipDomainEvidence,
      ...temporaryAliasEvidence,
      ...bypassEvidence,
      ...canaryEvidence,
      rootCertificateFingerprint256: pinnedFingerprint,
      stagedOrdinaryPoolCanaryPassed: true,
      productionPeerModeBound: 'verify-full',
      productionActivation: true,
      productionBindingMutated: true,
      canonicalRedeployExactGitSha: true,
      canonicalReadinessPassed: true,
      canonicalRedeployIdPresent: typeof canonicalRedeployId === 'string',
      databaseUrlRead: false,
      databaseUrlDecrypted: false,
      databaseUrlEmitted: false,
      credentialMaterialEmitted: false,
      rootCertificatePemEmitted: false,
      automationBypassSecretEmitted: false,
    });
  } catch (error) {
    if (persistentVerifyFullBound) {
      const rollbackPassed = await rollbackToLegacy({
        vercelToken,
        rootCertificatePem,
        githubSha,
      });
      if (!rollbackPassed) {
        return fail(
          'ACTIVATION_ROLLBACK_FAILED',
          'Production TLS activation failed and rollback could not be verified.',
        );
      }
    }
    throw error;
  } finally {
    const aliasDeleted = await deleteTemporaryAlias(
      temporaryAliasUid,
      vercelToken,
    );
    const deploymentDeleted = await deleteDeployment(
      stagedDeploymentId,
      vercelToken,
    );
    console.log(`activation_temporary_alias_deleted=${aliasDeleted}`);
    console.log(`activation_staged_deployment_deleted=${deploymentDeleted}`);
    if (!aliasDeleted || !deploymentDeleted) {
      process.exitCode = 1;
    }
  }
}

function printEvidence(evidence) {
  console.log('postgres_tls_b3_activation=pass');
  console.log(
    `staged_ordinary_pool_canary_passed=${evidence.stagedOrdinaryPoolCanaryPassed}`,
  );
  console.log(
    `production_peer_mode_bound=${evidence.productionPeerModeBound}`,
  );
  console.log(`production_activation=${evidence.productionActivation}`);
  console.log(
    `production_binding_mutated=${evidence.productionBindingMutated}`,
  );
  console.log(
    `canonical_redeploy_exact_git_sha=${evidence.canonicalRedeployExactGitSha}`,
  );
  console.log(
    `canonical_readiness_passed=${evidence.canonicalReadinessPassed}`,
  );
  console.log(
    `root_certificate_sensitive_binding=${evidence.rootCertificateSensitiveBinding}`,
  );
  console.log(
    `root_certificate_fingerprint256=${evidence.rootCertificateFingerprint256}`,
  );
  console.log(
    `ordinary_pool_connection_succeeded=${evidence.ordinaryPoolConnectionSucceeded}`,
  );
  console.log(`transaction_read_only=${evidence.transactionReadOnly}`);
  console.log(`principal_match=${evidence.principalMatch}`);
  console.log(
    `execution_role_membership=${evidence.executionRoleMembership}`,
  );
  console.log(`write_executed=${evidence.writeExecuted}`);
  console.log(`database_url_read=${evidence.databaseUrlRead}`);
  console.log(`database_url_decrypted=${evidence.databaseUrlDecrypted}`);
  console.log(`database_url_emitted=${evidence.databaseUrlEmitted}`);
  console.log(
    `credential_material_emitted=${evidence.credentialMaterialEmitted}`,
  );
  console.log(
    `root_certificate_pem_emitted=${evidence.rootCertificatePemEmitted}`,
  );
  console.log(
    `automation_bypass_secret_emitted=${evidence.automationBypassSecretEmitted}`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const evidence = await runProductionPostgresTlsB3Activation(process.env);
    printEvidence(evidence);
  } catch (error) {
    const code =
      error instanceof ActivationOrchestratorError
        ? error.code
        : 'ACTIVATION_UNEXPECTED_FAILURE';
    console.error(`production_tls_b3_activation=fail code=${code}`);
    process.exitCode = 1;
  }
}
