import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_ID = 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
const TEAM_ID = 'team_xuYA9OhCWlJETaYFOmeVodgS';
const PROJECT_NAME = 'myeongha';
const GITHUB_ORG = 'gycha0109-beep';
const GITHUB_REPO = 'MyeongHa';
const MARKER_PATH =
  'config/operations/run-once/production-postgres-tls-peer-canary-b2b.marker';
const MARKER_VALUE = 'VERIFY_POSTGRES_TLS_PEER_B2B_CANARY_ONCE\n';
const TRACK = 'security';

class CanaryOrchestratorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CanaryOrchestratorError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CanaryOrchestratorError(code, message);
}

function required(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, 'Required orchestration input is missing.');
  }
  return value.trim();
}

function requireAuthority(env) {
  if (
    env.GITHUB_EVENT_NAME !== 'push' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.MYEONGHA_WATCHTOWER_TRACK !== TRACK ||
    env.MYEONGHA_POSTGRES_TLS_PEER_CANARY_MARKER_PATH !== MARKER_PATH
  ) {
    return fail('ORCHESTRATION_AUTHORITY_INVALID', 'Canary authority is invalid.');
  }

  let marker = '';
  try {
    marker = readFileSync(MARKER_PATH, 'utf8');
  } catch {
    return fail('ORCHESTRATION_MARKER_MISSING', 'Canary marker is missing.');
  }
  if (marker !== MARKER_VALUE) {
    return fail('ORCHESTRATION_MARKER_INVALID', 'Canary marker is invalid.');
  }
}

async function requestJson(url, token, init, code) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
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

  if (response.status === 204) return {};
  try {
    return await response.json();
  } catch {
    return fail(code, 'Vercel API response was not JSON.');
  }
}

function createdIds(payload) {
  const created = Array.isArray(payload?.created)
    ? payload.created
    : payload?.created
      ? [payload.created]
      : [];
  return created
    .map((entry) => entry?.id)
    .filter((value) => typeof value === 'string' && value.length > 0);
}

async function pollDeployment(id, token) {
  const endpoint =
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(TEAM_ID)}`;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const deployment = await requestJson(
      endpoint,
      token,
      { method: 'GET' },
      'DEPLOYMENT_STATUS_FAILED',
    );
    const state = deployment?.readyState ?? deployment?.status;
    if (state === 'READY') return deployment;
    if (['ERROR', 'CANCELED', 'BLOCKED'].includes(state)) {
      return fail('DEPLOYMENT_NOT_READY', 'Canary deployment did not become ready.');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000));
  }
  return fail('DEPLOYMENT_TIMEOUT', 'Canary deployment timed out.');
}

async function deleteDeployment(id, token) {
  if (!id) return true;
  try {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(TEAM_ID)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      },
    );
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function deleteCustomEnvironment(id, token) {
  if (!id) return true;
  try {
    const response = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/custom-environments/${encodeURIComponent(id)}?teamId=${encodeURIComponent(TEAM_ID)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deleteUnassignedEnvironmentVariables: true }),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      },
    );
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

function validateCanaryEvidence(payload) {
  const evidence = payload?.evidence;
  if (
    payload?.status !== 'pass' ||
    evidence?.schemaVersion !== 'myeongha-production-postgres-tls-peer-canary-v1' ||
    evidence?.canaryTlsMode !== 'verify-full' ||
    evidence?.canaryPeerVerification !== 'full' ||
    evidence?.rejectUnauthorized !== true ||
    evidence?.defaultHostnameVerification !== true ||
    evidence?.rootCertificatePinned !== true ||
    evidence?.connectionSucceeded !== true ||
    evidence?.sslSession !== true ||
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
    return fail('CANARY_EVIDENCE_INVALID', 'Canary response did not satisfy the governed contract.');
  }
  return evidence;
}

export async function runProductionPostgresTlsPeerCanaryOrchestrator(env = process.env) {
  requireAuthority(env);

  const token = required(env.VERCEL_TOKEN, 'VERCEL_TOKEN_MISSING');
  const rootCertificatePem = required(
    env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
    'ROOT_CERTIFICATE_MISSING',
  );
  const githubSha = required(env.GITHUB_SHA, 'GITHUB_SHA_MISSING');

  const suffix = required(env.GITHUB_RUN_ID, 'GITHUB_RUN_ID_MISSING').slice(-12);
  const environmentSlug = `sec01-b2b-${suffix}`;
  const canaryToken = randomBytes(32).toString('base64url');

  let customEnvironmentId;
  let deploymentId;
  let cleanupDeployment = true;
  let cleanupEnvironment = true;

  try {
    const customEnvironment = await requestJson(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/custom-environments?teamId=${encodeURIComponent(TEAM_ID)}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          slug: environmentSlug,
          description: 'One-shot SEC-01 verify-full PostgreSQL TLS peer canary',
          copyEnvVarsFrom: 'production',
        }),
      },
      'CUSTOM_ENVIRONMENT_CREATE_FAILED',
    );

    if (
      typeof customEnvironment?.id !== 'string' ||
      !customEnvironment.id.startsWith('env_') ||
      customEnvironment.slug !== environmentSlug
    ) {
      return fail(
        'CUSTOM_ENVIRONMENT_INVALID',
        'Vercel custom environment response was not recognized.',
      );
    }
    customEnvironmentId = customEnvironment.id;

    const envCreate = await requestJson(
      `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${encodeURIComponent(TEAM_ID)}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify([
          {
            key: 'MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM',
            value: rootCertificatePem,
            type: 'sensitive',
            customEnvironmentIds: [customEnvironmentId],
            comment: 'Temporary SEC-01 B2B canary root authority',
          },
          {
            key: 'MYEONGHA_POSTGRES_TLS_CANARY_TOKEN',
            value: canaryToken,
            type: 'sensitive',
            customEnvironmentIds: [customEnvironmentId],
            comment: 'Temporary SEC-01 B2B canary authorization',
          },
        ]),
      },
      'CANARY_ENV_CREATE_FAILED',
    );

    if (createdIds(envCreate).length !== 2) {
      return fail(
        'CANARY_ENV_CREATE_FAILED',
        'Temporary canary environment variables were not created exactly.',
      );
    }

    const deployment = await requestJson(
      `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(TEAM_ID)}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          name: PROJECT_NAME,
          customEnvironmentSlugOrId: customEnvironmentId,
          gitSource: {
            type: 'github',
            org: GITHUB_ORG,
            repo: GITHUB_REPO,
            ref: githubSha,
          },
        }),
      },
      'DEPLOYMENT_CREATE_FAILED',
    );

    if (
      typeof deployment?.id !== 'string' ||
      typeof deployment?.url !== 'string'
    ) {
      return fail('DEPLOYMENT_CREATE_FAILED', 'Canary deployment response was not recognized.');
    }
    deploymentId = deployment.id;

    const ready = await pollDeployment(deploymentId, token);
    if (
      ready?.projectId !== PROJECT_ID ||
      ready?.meta?.githubCommitSha !== githubSha ||
      ready?.meta?.githubRepo !== GITHUB_REPO ||
      ready?.meta?.githubOrg !== GITHUB_ORG
    ) {
      return fail(
        'DEPLOYMENT_SOURCE_UNVERIFIED',
        'Canary deployment did not prove the exact governed Git source.',
      );
    }

    const deploymentUrl =
      typeof ready.url === 'string' ? ready.url : deployment.url;
    let canaryResponse;
    try {
      canaryResponse = await fetch(
        `https://${deploymentUrl}/api/readiness`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${canaryToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: '{}',
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      return fail('CANARY_REQUEST_FAILED', 'Canary endpoint request failed.');
    }

    if (!canaryResponse.ok) {
      return fail(
        'CANARY_REQUEST_FAILED',
        `Canary endpoint rejected the request with status ${canaryResponse.status}.`,
      );
    }

    let canaryPayload;
    try {
      canaryPayload = await canaryResponse.json();
    } catch {
      return fail('CANARY_RESPONSE_INVALID', 'Canary response was not JSON.');
    }

    const evidence = validateCanaryEvidence(canaryPayload);
    return Object.freeze({
      schemaVersion: 'myeongha-production-postgres-tls-peer-canary-orchestration-v1',
      customEnvironmentCreated: true,
      productionEnvironmentMutated: false,
      productionDatabaseBindingMutated: false,
      databaseUrlExported: false,
      databaseUrlDecrypted: false,
      canaryDeploymentExactGitSha: true,
      ...evidence,
    });
  } finally {
    cleanupDeployment = await deleteDeployment(deploymentId, token);
    cleanupEnvironment = await deleteCustomEnvironment(customEnvironmentId, token);
    console.log(`canary_deployment_deleted=${cleanupDeployment}`);
    console.log(`canary_custom_environment_deleted=${cleanupEnvironment}`);
    if (!cleanupDeployment || !cleanupEnvironment) {
      process.exitCode = 1;
    }
  }
}

function printEvidence(evidence) {
  console.log('postgres_tls_peer_canary=pass');
  console.log(`current_binding_tls_mode=${evidence.currentBindingTlsMode}`);
  console.log(
    `current_binding_peer_verification=${evidence.currentBindingPeerVerification}`,
  );
  console.log(`canary_tls_mode=${evidence.canaryTlsMode}`);
  console.log(`canary_peer_verification=${evidence.canaryPeerVerification}`);
  console.log(`reject_unauthorized=${evidence.rejectUnauthorized}`);
  console.log(
    `default_hostname_verification=${evidence.defaultHostnameVerification}`,
  );
  console.log(
    `root_certificate_fingerprint256=${evidence.rootCertificateFingerprint256}`,
  );
  console.log(`root_certificate_pinned=${evidence.rootCertificatePinned}`);
  console.log(`connection_succeeded=${evidence.connectionSucceeded}`);
  console.log(`ssl_session=${evidence.sslSession}`);
  console.log(`transaction_read_only=${evidence.transactionReadOnly}`);
  console.log(`principal_expected=${evidence.principalExpected}`);
  console.log(`principal_match=${evidence.principalMatch}`);
  console.log(`execution_role=${evidence.executionRole}`);
  console.log(
    `execution_role_membership=${evidence.executionRoleMembership}`,
  );
  console.log(`write_executed=${evidence.writeExecuted}`);
  console.log(
    `production_environment_mutated=${evidence.productionEnvironmentMutated}`,
  );
  console.log(
    `production_database_binding_mutated=${evidence.productionDatabaseBindingMutated}`,
  );
  console.log(`database_url_exported=${evidence.databaseUrlExported}`);
  console.log(`database_url_decrypted=${evidence.databaseUrlDecrypted}`);
  console.log(`database_url_emitted=${evidence.databaseUrlEmitted}`);
  console.log(
    `credential_material_emitted=${evidence.credentialMaterialEmitted}`,
  );
  console.log(
    `root_certificate_pem_emitted=${evidence.rootCertificatePemEmitted}`,
  );
}

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  try {
    const evidence =
      await runProductionPostgresTlsPeerCanaryOrchestrator(process.env);
    printEvidence(evidence);
  } catch (error) {
    const code =
      error instanceof CanaryOrchestratorError
        ? error.code
        : 'CANARY_ORCHESTRATION_UNEXPECTED_FAILURE';
    console.error(`postgres_tls_peer_canary=fail code=${code}`);
    process.exitCode = 1;
  }
}
