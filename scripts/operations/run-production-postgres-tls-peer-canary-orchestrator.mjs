import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_ID = 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
const TEAM_ID = 'team_xuYA9OhCWlJETaYFOmeVodgS';
const MARKER_PATH =
  'config/operations/run-once/production-postgres-tls-peer-canary-b2b.marker';
const MARKER_VALUE =
  'VERIFY_POSTGRES_TLS_PEER_B2B_SKIP_DOMAIN_CANARY_RETRY11\n';
const TRACK = 'security';
const VERCEL_CLI_PACKAGE = 'vercel@59.16.0';
const CANARY_MODE = 'one-shot-b2b';
const ALLOWED_GENERATED_CLI_ALIAS = 'myeongha-johnny-self.vercel.app';

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

export function inspectAutomationBypassBinding(
  projectPayload,
  automationBypassSecret,
) {
  const protectionBypass = projectPayload?.protectionBypass;
  if (
    protectionBypass === null ||
    typeof protectionBypass !== 'object' ||
    Array.isArray(protectionBypass)
  ) {
    return fail(
      'VERCEL_AUTOMATION_BYPASS_BINDING_UNAVAILABLE',
      'Vercel project automation bypass metadata is unavailable.',
    );
  }

  const metadata = protectionBypass[automationBypassSecret];
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    metadata.scope !== 'automation-bypass'
  ) {
    return fail(
      'VERCEL_AUTOMATION_BYPASS_SECRET_MISMATCH',
      'Configured automation bypass secret does not match the governed Vercel project.',
    );
  }

  return Object.freeze({
    automationBypassProjectMatch: true,
    automationBypassScope: 'automation-bypass',
    automationBypassSecretEmitted: false,
  });
}

async function verifyAutomationBypassBinding(input) {
  const project = await requestJson(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(PROJECT_ID)}?teamId=${encodeURIComponent(TEAM_ID)}`,
    input.vercelToken,
    { method: 'GET' },
    'VERCEL_AUTOMATION_BYPASS_BINDING_LOOKUP_FAILED',
  );

  return inspectAutomationBypassBinding(
    project,
    input.automationBypassSecret,
  );
}

function boundedAppend(current, chunk) {
  const next = current + chunk.toString('utf8');
  return next.length > 65_536 ? next.slice(-65_536) : next;
}

function classifyVercelCliFailure(stderr) {
  const normalized = stderr.toLowerCase();
  if (
    normalized.includes('unknown option') ||
    normalized.includes('unexpected option') ||
    normalized.includes('invalid option')
  ) {
    return 'DEPLOYMENT_CLI_OPTION_INVALID';
  }
  if (
    normalized.includes('project not found') ||
    normalized.includes('could not find project') ||
    normalized.includes('scope') && normalized.includes('project')
  ) {
    return 'DEPLOYMENT_PROJECT_RESOLUTION_FAILED';
  }
  if (
    normalized.includes('unauthorized') ||
    normalized.includes('authentication') ||
    normalized.includes('invalid token') ||
    normalized.includes('not authenticated')
  ) {
    return 'DEPLOYMENT_AUTH_FAILED';
  }
  if (
    normalized.includes('environment variable') ||
    normalized.includes('invalid env') ||
    normalized.includes('invalid environment')
  ) {
    return 'DEPLOYMENT_ENV_INVALID';
  }
  if (
    normalized.includes('build failed') ||
    normalized.includes('build error') ||
    normalized.includes('command') && normalized.includes('exited with')
  ) {
    return 'DEPLOYMENT_BUILD_FAILED';
  }
  return 'DEPLOYMENT_CREATE_FAILED';
}

export function buildSkipDomainDeploymentArgs(input) {
  return [
    '--yes',
    VERCEL_CLI_PACKAGE,
    'deploy',
    '.',
    '--prod',
    '--skip-domain',
    '--yes',
    '--env',
    `MYEONGHA_DATABASE_SSL_ROOT_CERT_B64=${input.rootCertificateBase64}`,
    '--env',
    `MYEONGHA_POSTGRES_TLS_CANARY_TOKEN=${input.canaryToken}`,
    '--env',
    `MYEONGHA_POSTGRES_TLS_CANARY_MODE=${CANARY_MODE}`,
    '--env',
    `MYEONGHA_POSTGRES_TLS_CANARY_SHA=${input.githubSha}`,
    '--meta',
    `myeonghaCanarySha=${input.githubSha}`,
  ];
}

export function buildAutomationBypassCanaryHeaders(input) {
  return Object.freeze({
    Authorization: `Bearer ${input.canaryToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-vercel-protection-bypass': input.automationBypassSecret,
  });
}

async function runAutomationBypassCanaryRequest(input) {
  let response;
  try {
    response = await fetch(
      `${input.deploymentUrl}/api/readiness`,
      {
        method: 'POST',
        headers: buildAutomationBypassCanaryHeaders(input),
        body: '{}',
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    return fail(
      'CANARY_AUTOMATION_BYPASS_REQUEST_FAILED',
      'Automation bypass canary request failed.',
    );
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400)
  ) {
    return fail(
      'CANARY_AUTOMATION_BYPASS_REJECTED',
      'Vercel Deployment Protection rejected the automation bypass request.',
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      return fail(
        'CANARY_REQUEST_REJECTED',
        'Canary endpoint rejected the request.',
      );
    }
    return fail(
      'CANARY_RESPONSE_INVALID',
      'Canary response was not JSON.',
    );
  }

  if (
    payload?.status === 'fail' &&
    typeof payload?.code === 'string' &&
    /^[A-Z0-9_]+$/u.test(payload.code)
  ) {
    return fail(
      `CANARY_ENDPOINT_${payload.code}`,
      'Canary endpoint reported a fail-closed result.',
    );
  }

  if (!response.ok) {
    return fail(
      'CANARY_REQUEST_REJECTED',
      'Canary endpoint rejected the request.',
    );
  }

  return payload;
}

function runSkipDomainDeployment(input) {
  return new Promise((resolvePromise, rejectPromise) => {
    const childEnv = { ...process.env };
    delete childEnv.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM;
    childEnv.VERCEL_TOKEN = input.vercelToken;
    childEnv.VERCEL_ORG_ID = TEAM_ID;
    childEnv.VERCEL_PROJECT_ID = PROJECT_ID;

    const args = buildSkipDomainDeploymentArgs(input);

    const child = spawn('npx', args, {
      cwd: process.cwd(),
      env: childEnv,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout = boundedAppend(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = boundedAppend(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 180_000);

    child.once('error', () => {
      clearTimeout(timeout);
      rejectPromise(
        new CanaryOrchestratorError(
          'DEPLOYMENT_CREATE_FAILED',
          'Vercel CLI deployment process failed to start.',
        ),
      );
    });

    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (code !== 0 || signal !== null) {
        rejectPromise(
          new CanaryOrchestratorError(
            classifyVercelCliFailure(stderr),
            'Vercel skip-domain deployment failed.',
          ),
        );
        return;
      }

      const urls = stdout.match(/https:\/\/[a-z0-9][a-z0-9.-]*[.]vercel[.]app/giu) ?? [];
      const deploymentUrl = urls.at(-1);
      if (deploymentUrl === undefined || stderr.includes('Error:')) {
        rejectPromise(
          new CanaryOrchestratorError(
            'DEPLOYMENT_URL_MISSING',
            'Vercel skip-domain deployment did not return a deployment URL.',
          ),
        );
        return;
      }
      resolvePromise(deploymentUrl);
    });
  });
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

export function inspectSkipDomainAliasEvidence(payload) {
  if (!Array.isArray(payload?.aliases)) {
    return fail(
      'DEPLOYMENT_ALIAS_LOOKUP_INVALID',
      'Skip-domain alias response is not recognized.',
    );
  }

  const names = payload.aliases.map((entry) =>
    typeof entry?.alias === 'string' ? entry.alias : null,
  );

  if (
    names.length !== 1 ||
    names[0] !== ALLOWED_GENERATED_CLI_ALIAS
  ) {
    return fail(
      'DEPLOYMENT_ALIAS_PRESENT',
      'Skip-domain canary deployment has a non-generated alias.',
    );
  }

  return Object.freeze({
    generatedCliAliasPresent: true,
    generatedCliAlias: ALLOWED_GENERATED_CLI_ALIAS,
    productionDomainAliased: false,
  });
}

function validateCanaryEvidence(payload) {
  const evidence = payload?.evidence;
  if (
    payload?.status !== 'pass' ||
    evidence?.schemaVersion !== 'myeongha-production-postgres-tls-peer-canary-v1' ||
    evidence?.deploymentTarget !== 'production' ||
    evidence?.exactGitShaBound !== true ||
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

  const rootCertificateBase64 = Buffer.from(rootCertificatePem, 'utf8').toString('base64');
  const canaryToken = randomBytes(32).toString('base64url');

  let deploymentId;
  let cleanupDeployment = true;

  try {
    const bypassBindingEvidence =
      await verifyAutomationBypassBinding({
        vercelToken: token,
        automationBypassSecret,
      });

    const deploymentUrl = await runSkipDomainDeployment({
      vercelToken: token,
      rootCertificateBase64,
      canaryToken,
      githubSha,
    });

    const hostname = new URL(deploymentUrl).hostname;
    const deployment = await requestJson(
      `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}?teamId=${encodeURIComponent(TEAM_ID)}`,
      token,
      { method: 'GET' },
      'DEPLOYMENT_STATUS_FAILED',
    );

    if (
      typeof deployment?.id !== 'string' ||
      deployment?.readyState !== 'READY' ||
      deployment?.meta?.myeonghaCanarySha !== githubSha ||
      deployment?.meta?.githubCommitSha !== githubSha
    ) {
      return fail(
        'DEPLOYMENT_SOURCE_UNVERIFIED',
        'Canary deployment did not prove the exact governed Git source.',
      );
    }
    deploymentId = deployment.id;

    const aliases = await requestJson(
      `https://api.vercel.com/v2/deployments/${encodeURIComponent(deploymentId)}/aliases?teamId=${encodeURIComponent(TEAM_ID)}`,
      token,
      { method: 'GET' },
      'DEPLOYMENT_ALIAS_LOOKUP_FAILED',
    );
    const aliasEvidence = inspectSkipDomainAliasEvidence(aliases);

    const canaryPayload = await runAutomationBypassCanaryRequest({
      deploymentUrl,
      canaryToken,
      automationBypassSecret,
    });

    const evidence = validateCanaryEvidence(canaryPayload);
    return Object.freeze({
      schemaVersion: 'myeongha-production-postgres-tls-peer-canary-orchestration-v2',
      deploymentMode: 'production-skip-domain',
      customEnvironmentCreated: false,
      ...aliasEvidence,
      ...bypassBindingEvidence,
      automationBypassUsed: true,
      projectDeploymentProtectionMutated: false,
      productionEnvironmentMutated: false,
      productionDatabaseBindingMutated: false,
      databaseUrlExported: false,
      databaseUrlDecrypted: false,
      canaryDeploymentExactGitSha: true,
      ...evidence,
    });
  } finally {
    cleanupDeployment = await deleteDeployment(deploymentId, token);
    console.log(`canary_deployment_deleted=${cleanupDeployment}`);

    if (!cleanupDeployment) {
      process.exitCode = 1;
    }
  }
}

function printEvidence(evidence) {
  console.log('postgres_tls_peer_canary=pass');
  console.log(`deployment_mode=${evidence.deploymentMode}`);
  console.log(`production_domain_aliased=${evidence.productionDomainAliased}`);
  console.log(
    `automation_bypass_project_match=${evidence.automationBypassProjectMatch}`,
  );
  console.log(
    `automation_bypass_scope=${evidence.automationBypassScope}`,
  );
  console.log(
    `automation_bypass_used=${evidence.automationBypassUsed}`,
  );
  console.log(
    `automation_bypass_secret_emitted=${evidence.automationBypassSecretEmitted}`,
  );
  console.log(
    `project_deployment_protection_mutated=${evidence.projectDeploymentProtectionMutated}`,
  );
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
