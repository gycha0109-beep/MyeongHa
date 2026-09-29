import { X509Certificate } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const TLS_MODE = 'verify-full';
const POOLER_HOST_PATTERN =
  /^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u;
const FINGERPRINT_256_PATTERN =
  /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u;
const PRIVATE_KEY_MARKERS = Object.freeze([
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
]);
const ROOT_FILE_NAME = 'myeongha-production-postgres-root.crt';

export class ProductionPrivilegedPostgresLibpqTlsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProductionPrivilegedPostgresLibpqTlsError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionPrivilegedPostgresLibpqTlsError(code, message);
}

function requiredString(value, code, message) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(code, message);
  }
  return value.trim();
}

export function inspectProductionPrivilegedLibpqTlsAuthority({
  rootCertificatePem,
  sessionPoolerHost,
  expectedFingerprint256,
  now = new Date(),
}) {
  const pem = requiredString(
    rootCertificatePem,
    'ROOT_CERTIFICATE_MISSING',
    'Privileged PostgreSQL libpq TLS requires the governed root certificate.',
  );
  const host = requiredString(
    sessionPoolerHost,
    'SESSION_POOLER_HOST_MISSING',
    'Privileged PostgreSQL libpq TLS requires the governed Session Pooler host.',
  ).toLowerCase();
  const fingerprint = requiredString(
    expectedFingerprint256,
    'ROOT_CERTIFICATE_FINGERPRINT_INVALID',
    'Privileged PostgreSQL libpq TLS requires the governed SHA-256 fingerprint.',
  );

  if (!POOLER_HOST_PATTERN.test(host)) {
    fail(
      'SESSION_POOLER_HOST_INVALID',
      'Privileged PostgreSQL libpq TLS requires a bare *.pooler.supabase.com host.',
    );
  }
  if (!FINGERPRINT_256_PATTERN.test(fingerprint)) {
    fail(
      'ROOT_CERTIFICATE_FINGERPRINT_INVALID',
      'Privileged PostgreSQL libpq TLS fingerprint must be canonical uppercase SHA-256.',
    );
  }

  for (const marker of PRIVATE_KEY_MARKERS) {
    if (pem.includes(marker)) {
      fail(
        'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
        'Privileged PostgreSQL libpq TLS root material must not contain a private key.',
      );
    }
  }

  const beginCount = pem.match(/-----BEGIN CERTIFICATE-----/gu)?.length ?? 0;
  const endCount = pem.match(/-----END CERTIFICATE-----/gu)?.length ?? 0;
  if (beginCount !== 1 || endCount !== 1) {
    fail(
      'ROOT_CERTIFICATE_INVALID',
      'Privileged PostgreSQL libpq TLS requires exactly one PEM encoded X.509 certificate.',
    );
  }

  let certificate;
  try {
    certificate = new X509Certificate(pem);
  } catch {
    fail(
      'ROOT_CERTIFICATE_INVALID',
      'Privileged PostgreSQL libpq TLS root material is not a valid X.509 certificate.',
    );
  }

  if (certificate.ca !== true) {
    fail(
      'ROOT_CERTIFICATE_NOT_CA',
      'Privileged PostgreSQL libpq TLS root certificate must be a CA certificate.',
    );
  }
  if (certificate.fingerprint256 !== fingerprint) {
    fail(
      'ROOT_CERTIFICATE_FINGERPRINT_MISMATCH',
      'Privileged PostgreSQL libpq TLS root certificate does not match the governed fingerprint.',
    );
  }

  const nowMs = now.getTime();
  const validFromMs = Date.parse(certificate.validFrom);
  const validToMs = Date.parse(certificate.validTo);
  if (!Number.isFinite(nowMs) || !Number.isFinite(validFromMs) || !Number.isFinite(validToMs)) {
    fail(
      'ROOT_CERTIFICATE_INVALID',
      'Privileged PostgreSQL libpq TLS certificate validity could not be evaluated.',
    );
  }
  if (nowMs < validFromMs) {
    fail(
      'ROOT_CERTIFICATE_NOT_YET_VALID',
      'Privileged PostgreSQL libpq TLS root certificate is not yet valid.',
    );
  }
  if (nowMs > validToMs) {
    fail(
      'ROOT_CERTIFICATE_EXPIRED',
      'Privileged PostgreSQL libpq TLS root certificate is expired.',
    );
  }

  return Object.freeze({
    projectRef: PROJECT_REF,
    tlsMode: TLS_MODE,
    peerVerification: 'full',
    rootCertificateFingerprint256: certificate.fingerprint256,
    rootCertificatePinned: true,
    sessionPoolerHostShapeValid: true,
    sessionPoolerHostnameEmitted: false,
    certificatePemEmitted: false,
    credentialMaterialEmitted: false,
  });
}

export async function prepareProductionPrivilegedPostgresLibpqTls({
  rootCertificatePem,
  sessionPoolerHost,
  expectedFingerprint256,
  runnerTemp,
  now = new Date(),
}) {
  const evidence = inspectProductionPrivilegedLibpqTlsAuthority({
    rootCertificatePem,
    sessionPoolerHost,
    expectedFingerprint256,
    now,
  });

  const tempRoot = requiredString(
    runnerTemp,
    'RUNNER_TEMP_MISSING',
    'Privileged PostgreSQL libpq TLS requires RUNNER_TEMP.',
  );
  const rootPath = path.join(tempRoot, ROOT_FILE_NAME);
  await mkdir(tempRoot, { recursive: true });
  await writeFile(rootPath, rootCertificatePem.trim() + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(rootPath, 0o600);

  return Object.freeze({
    rootPath,
    env: Object.freeze({
      PGSSLMODE: TLS_MODE,
      PGSSLROOTCERT: rootPath,
    }),
    evidence,
  });
}

export async function cleanupProductionPrivilegedPostgresLibpqTls(runnerTemp) {
  if (typeof runnerTemp !== 'string' || runnerTemp.trim().length === 0) return;
  await rm(path.join(runnerTemp, ROOT_FILE_NAME), { force: true });
}

async function loadGovernedFingerprint() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(
    currentDir,
    '../../config/operations/production-postgres-tls-peer-verification-v1.json',
  );
  const parsed = JSON.parse(await readFile(configPath, 'utf8'));
  const fingerprint =
    parsed?.rootCertificateAuthority?.productionFingerprint256;
  return requiredString(
    fingerprint,
    'ROOT_CERTIFICATE_FINGERPRINT_INVALID',
    'Governed Production PostgreSQL TLS evidence is missing its root fingerprint.',
  );
}

async function appendGithubEnv(name, value) {
  const githubEnv = requiredString(
    process.env.GITHUB_ENV,
    'GITHUB_ENV_MISSING',
    'GitHub Actions environment path is required.',
  );
  await writeFile(githubEnv, `${name}=${value}\n`, {
    encoding: 'utf8',
    flag: 'a',
    mode: 0o600,
  });
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'cleanup') {
    await cleanupProductionPrivilegedPostgresLibpqTls(process.env.RUNNER_TEMP);
    console.log('privileged_postgres_libpq_tls_cleanup=pass');
    return;
  }
  if (mode !== 'prepare') {
    fail(
      'MODE_INVALID',
      'Usage: prepare-production-privileged-postgres-libpq-tls.mjs prepare|cleanup',
    );
  }

  const result = await prepareProductionPrivilegedPostgresLibpqTls({
    rootCertificatePem:
      process.env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM ??
      process.env.MYEONGHA_WORKER_DATABASE_SSL_ROOT_CERT_PEM,
    sessionPoolerHost: process.env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST,
    expectedFingerprint256: await loadGovernedFingerprint(),
    runnerTemp: process.env.RUNNER_TEMP,
  });

  await appendGithubEnv('PGSSLMODE', result.env.PGSSLMODE);
  await appendGithubEnv('PGSSLROOTCERT', result.env.PGSSLROOTCERT);

  console.log('privileged_postgres_libpq_tls_prepare=pass');
  console.log(`tls_mode=${result.evidence.tlsMode}`);
  console.log(
    `root_certificate_fingerprint256=${result.evidence.rootCertificateFingerprint256}`,
  );
  console.log(
    `root_certificate_pinned=${result.evidence.rootCertificatePinned}`,
  );
  console.log(
    `session_pooler_host_shape_valid=${result.evidence.sessionPoolerHostShapeValid}`,
  );
  console.log(
    `session_pooler_hostname_emitted=${result.evidence.sessionPoolerHostnameEmitted}`,
  );
  console.log(
    `certificate_pem_emitted=${result.evidence.certificatePemEmitted}`,
  );
  console.log(
    `credential_material_emitted=${result.evidence.credentialMaterialEmitted}`,
  );
}

const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  main().catch((error) => {
    const code =
      error instanceof ProductionPrivilegedPostgresLibpqTlsError
        ? error.code
        : 'UNEXPECTED';
    console.error(`privileged_postgres_libpq_tls_prepare=fail code=${code}`);
    process.exitCode = 1;
  });
}
