import { X509Certificate } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
export const MYEONGHA_PRODUCTION_VERCEL_PROJECT_ID =
  'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
export const MYEONGHA_PRODUCTION_VERCEL_TEAM_ID =
  'team_xuYA9OhCWlJETaYFOmeVodgS';
export const MYEONGHA_PRODUCTION_VERCEL_PROJECT_NAME = 'myeongha';

export const POSTGRES_TLS_PEER_PREFLIGHT_CONFIRM =
  'VERIFY_POSTGRES_TLS_PEER_B2A';
export const POSTGRES_TLS_PEER_PREFLIGHT_TRACK = 'ops';
export const POSTGRES_TLS_PEER_CERTIFICATE_SOURCE =
  'official-supabase-dashboard';

const FINGERPRINT_256_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u;
const POOLER_HOST_PATTERN =
  /^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u;
const PRIVATE_KEY_MARKERS = Object.freeze([
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
]);

export class ProductionPostgresTlsPeerPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionPostgresTlsPeerPreflightError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionPostgresTlsPeerPreflightError(code, message);
}

function requireNonEmptyString(value, code, message) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, message);
  }
  return value.trim();
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function inspectServerRootCertificatePem(
  rootCertificatePem,
  now = new Date(),
) {
  const normalized = requireNonEmptyString(
    rootCertificatePem,
    'ROOT_CERTIFICATE_MISSING',
    'Production PostgreSQL TLS authority requires a Server root certificate.',
  );

  for (const marker of PRIVATE_KEY_MARKERS) {
    if (normalized.includes(marker)) {
      return fail(
        'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
        'Production PostgreSQL TLS authority must not contain private-key material.',
      );
    }
  }

  const beginCount =
    normalized.match(/-----BEGIN CERTIFICATE-----/gu)?.length ?? 0;
  const endCount =
    normalized.match(/-----END CERTIFICATE-----/gu)?.length ?? 0;

  if (beginCount !== 1 || endCount !== 1) {
    return fail(
      'ROOT_CERTIFICATE_INVALID',
      'Production PostgreSQL TLS authority requires exactly one PEM encoded X.509 certificate.',
    );
  }

  let certificate;
  try {
    certificate = new X509Certificate(normalized);
  } catch {
    return fail(
      'ROOT_CERTIFICATE_INVALID',
      'Production PostgreSQL TLS authority is not a valid X.509 certificate.',
    );
  }

  if (certificate.ca !== true) {
    return fail(
      'ROOT_CERTIFICATE_NOT_CA',
      'Production PostgreSQL TLS authority certificate must be a CA certificate.',
    );
  }

  if (!FINGERPRINT_256_PATTERN.test(certificate.fingerprint256)) {
    return fail(
      'ROOT_CERTIFICATE_INVALID',
      'Production PostgreSQL TLS authority fingerprint is not canonical SHA-256.',
    );
  }

  const validFromMs = Date.parse(certificate.validFrom);
  const validToMs = Date.parse(certificate.validTo);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;

  if (
    !Number.isFinite(validFromMs) ||
    !Number.isFinite(validToMs) ||
    !Number.isFinite(nowMs)
  ) {
    return fail(
      'ROOT_CERTIFICATE_INVALID',
      'Production PostgreSQL TLS authority certificate validity cannot be evaluated.',
    );
  }

  if (nowMs < validFromMs) {
    return fail(
      'ROOT_CERTIFICATE_NOT_YET_VALID',
      'Production PostgreSQL TLS authority certificate is not yet valid.',
    );
  }

  if (nowMs >= validToMs) {
    return fail(
      'ROOT_CERTIFICATE_EXPIRED',
      'Production PostgreSQL TLS authority certificate is expired.',
    );
  }

  return Object.freeze({
    certificateSource: POSTGRES_TLS_PEER_CERTIFICATE_SOURCE,
    certificateParse: 'pass',
    certificateValidNow: true,
    certificatePrivateKeyPresent: false,
    certificateFingerprint256: certificate.fingerprint256,
    certificatePemEmitted: false,
  });
}

export function inspectProductionSessionPoolerHost(poolerHost) {
  const normalized = requireNonEmptyString(
    poolerHost,
    'SESSION_POOLER_HOST_MISSING',
    'Production Session Pooler host is required for B2 authority preflight.',
  );

  if (!POOLER_HOST_PATTERN.test(normalized)) {
    return fail(
      'SESSION_POOLER_HOST_INVALID',
      'Production Session Pooler host must be a bare *.pooler.supabase.com hostname.',
    );
  }

  return Object.freeze({
    sessionPoolerHostPresent: true,
    sessionPoolerHostShapeValid: true,
    sessionPoolerHostnameEmitted: false,
  });
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

export function inspectVercelDatabaseEnvMetadata(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.envs)) {
    return fail(
      'VERCEL_ENV_METADATA_INVALID',
      'Vercel environment metadata response is not recognized.',
    );
  }

  const matches = payload.envs.filter((entry) => {
    if (!isRecord(entry) || entry.key !== 'MYEONGHA_DATABASE_URL') return false;
    return normalizeTargets(entry.target).includes('production');
  });

  if (matches.length === 0) {
    return fail(
      'VERCEL_DATABASE_ENV_MISSING',
      'MYEONGHA_DATABASE_URL is not bound to Vercel Production.',
    );
  }

  if (matches.length !== 1) {
    return fail(
      'VERCEL_DATABASE_ENV_AMBIGUOUS',
      'MYEONGHA_DATABASE_URL has ambiguous Vercel Production bindings.',
    );
  }

  const type = matches[0].type;
  if (type !== 'sensitive' && type !== 'encrypted') {
    return fail(
      'VERCEL_DATABASE_ENV_TYPE_UNSUPPORTED',
      'MYEONGHA_DATABASE_URL must use a supported protected Vercel environment-variable type.',
    );
  }

  return Object.freeze({
    vercelDatabaseEnvExists: true,
    vercelDatabaseEnvTarget: 'production',
    vercelDatabaseEnvType: type,
    vercelDatabaseEnvValueRead: false,
    vercelDatabaseEnvValueEmitted: false,
    preferredB2bExecution:
      type === 'sensitive'
        ? 'vercel-runtime-required'
        : 'vercel-runtime-preferred',
  });
}

export function buildProductionPostgresTlsPeerPreflightEvidence(input) {
  return Object.freeze({
    schemaVersion: 'myeongha-production-postgres-tls-peer-preflight-v1',
    projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
    ...inspectServerRootCertificatePem(input.rootCertificatePem, input.now),
    ...inspectProductionSessionPoolerHost(input.sessionPoolerHost),
    ...inspectVercelDatabaseEnvMetadata(input.vercelEnvMetadata),
    productionDatabaseConnectionAttempted: false,
    productionDatabaseUrlMutated: false,
    productionVercelBindingMutated: false,
    databaseUrlEmitted: false,
    credentialMaterialEmitted: false,
  });
}

async function fetchJson(url, token, errorCode) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return fail(errorCode, 'Vercel metadata request failed.');
  }

  if (!response.ok) {
    return fail(errorCode, 'Vercel metadata request was rejected.');
  }

  try {
    return await response.json();
  } catch {
    return fail(errorCode, 'Vercel metadata response was not JSON.');
  }
}

export async function fetchGovernedVercelProductionEnvMetadata(input) {
  const token = requireNonEmptyString(
    input.vercelToken,
    'VERCEL_TOKEN_MISSING',
    'VERCEL_TOKEN is required for metadata-only Production preflight.',
  );

  const project = await fetchJson(
    `https://api.vercel.com/v9/projects/${MYEONGHA_PRODUCTION_VERCEL_PROJECT_ID}?teamId=${MYEONGHA_PRODUCTION_VERCEL_TEAM_ID}`,
    token,
    'VERCEL_PROJECT_LOOKUP_FAILED',
  );

  if (
    !isRecord(project) ||
    project.id !== MYEONGHA_PRODUCTION_VERCEL_PROJECT_ID ||
    project.name !== MYEONGHA_PRODUCTION_VERCEL_PROJECT_NAME
  ) {
    return fail(
      'VERCEL_PROJECT_MISMATCH',
      'Vercel metadata preflight resolved a non-governed project.',
    );
  }

  return fetchJson(
    `https://api.vercel.com/v10/projects/${MYEONGHA_PRODUCTION_VERCEL_PROJECT_ID}/env?teamId=${MYEONGHA_PRODUCTION_VERCEL_TEAM_ID}`,
    token,
    'VERCEL_ENV_METADATA_LOOKUP_FAILED',
  );
}

function requireRuntimeAuthority(env) {
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    return fail(
      'DISPATCH_AUTHORITY_INVALID',
      'Production PostgreSQL TLS peer preflight requires workflow_dispatch.',
    );
  }
  if (env.GITHUB_REF !== 'refs/heads/main') {
    return fail(
      'DISPATCH_AUTHORITY_INVALID',
      'Production PostgreSQL TLS peer preflight requires main.',
    );
  }
  if (env.MYEONGHA_WATCHTOWER_TRACK !== POSTGRES_TLS_PEER_PREFLIGHT_TRACK) {
    return fail(
      'DISPATCH_AUTHORITY_INVALID',
      'Production PostgreSQL TLS peer preflight requires Watchtower track ops.',
    );
  }
  if (env.MYEONGHA_POSTGRES_TLS_PEER_PREFLIGHT_CONFIRM !== POSTGRES_TLS_PEER_PREFLIGHT_CONFIRM) {
    return fail(
      'DISPATCH_AUTHORITY_INVALID',
      'Production PostgreSQL TLS peer preflight confirmation is invalid.',
    );
  }
}

export async function runProductionPostgresTlsPeerPreflight(env = process.env) {
  requireRuntimeAuthority(env);

  const rootCertificatePem = requireNonEmptyString(
    env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
    'ROOT_CERTIFICATE_MISSING',
    'Production Server root certificate secret is required.',
  );
  const sessionPoolerHost = requireNonEmptyString(
    env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST,
    'SESSION_POOLER_HOST_MISSING',
    'Production Session Pooler host secret is required.',
  );
  const vercelToken = requireNonEmptyString(
    env.VERCEL_TOKEN,
    'VERCEL_TOKEN_MISSING',
    'VERCEL_TOKEN is required.',
  );

  const vercelEnvMetadata =
    await fetchGovernedVercelProductionEnvMetadata({ vercelToken });

  return buildProductionPostgresTlsPeerPreflightEvidence({
    rootCertificatePem,
    sessionPoolerHost,
    vercelEnvMetadata,
  });
}

function printEvidence(evidence) {
  console.log('postgres_tls_authority_preflight=pass');
  console.log(`project_ref=${evidence.projectRef}`);
  console.log(`certificate_source=${evidence.certificateSource}`);
  console.log(`certificate_parse=${evidence.certificateParse}`);
  console.log(`certificate_valid_now=${evidence.certificateValidNow}`);
  console.log(
    `certificate_private_key_present=${evidence.certificatePrivateKeyPresent}`,
  );
  console.log(
    `certificate_fingerprint256=${evidence.certificateFingerprint256}`,
  );
  console.log(
    `certificate_pem_emitted=${evidence.certificatePemEmitted}`,
  );
  console.log(
    `session_pooler_host_present=${evidence.sessionPoolerHostPresent}`,
  );
  console.log(
    `session_pooler_host_shape_valid=${evidence.sessionPoolerHostShapeValid}`,
  );
  console.log(
    `session_pooler_hostname_emitted=${evidence.sessionPoolerHostnameEmitted}`,
  );
  console.log(
    `vercel_database_env_exists=${evidence.vercelDatabaseEnvExists}`,
  );
  console.log(
    `vercel_database_env_target=${evidence.vercelDatabaseEnvTarget}`,
  );
  console.log(
    `vercel_database_env_type=${evidence.vercelDatabaseEnvType}`,
  );
  console.log(
    `vercel_database_env_value_read=${evidence.vercelDatabaseEnvValueRead}`,
  );
  console.log(
    `preferred_b2b_execution=${evidence.preferredB2bExecution}`,
  );
  console.log(
    `production_database_connection_attempted=${evidence.productionDatabaseConnectionAttempted}`,
  );
  console.log(
    `production_database_url_mutated=${evidence.productionDatabaseUrlMutated}`,
  );
  console.log(
    `production_vercel_binding_mutated=${evidence.productionVercelBindingMutated}`,
  );
  console.log(`database_url_emitted=${evidence.databaseUrlEmitted}`);
  console.log(
    `credential_material_emitted=${evidence.credentialMaterialEmitted}`,
  );
}

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  try {
    const evidence = await runProductionPostgresTlsPeerPreflight();
    printEvidence(evidence);
  } catch (error) {
    const code =
      error instanceof ProductionPostgresTlsPeerPreflightError
        ? error.code
        : 'UNEXPECTED_PREFLIGHT_FAILURE';
    console.error(`postgres_tls_authority_preflight=fail code=${code}`);
    process.exitCode = 1;
  }
}
