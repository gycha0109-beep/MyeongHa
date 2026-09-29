import { X509Certificate } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const DATABASE = 'postgres';
const PORT = '5432';
const POOLER_HOST_PATTERN =
  /^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u;
const PRIVATE_KEY_MARKERS = Object.freeze([
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
]);

export class StrictLibpqPreparationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StrictLibpqPreparationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new StrictLibpqPreparationError(code, message);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      return fail('INVALID_ARGUMENTS', 'Strict libpq preparation arguments are invalid.');
    }
    values.set(key.slice(2), value);
  }
  return Object.freeze({
    output: values.get('output') ?? '',
    host: values.get('host') ?? '',
    principal: values.get('principal') ?? '',
    port: values.get('port') ?? '',
    database: values.get('database') ?? '',
  });
}

function requireNonEmpty(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, 'Required strict libpq authority input is missing.');
  }
  return value.trim();
}

async function loadGovernedFingerprint() {
  const authoritySource = await readFile(
    new URL(
      '../../apps/api/src/production-postgres-tls-peer-verification.ts',
      import.meta.url,
    ),
    'utf8',
  );
  const match = authoritySource.match(
    /PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1\s*=\s*[\r\n\s]*'((?:[0-9A-F]{2}:){31}[0-9A-F]{2})'/u,
  );
  if (!match) {
    return fail(
      'PINNED_FINGERPRINT_AUTHORITY_MISSING',
      'Governed PostgreSQL TLS root fingerprint authority could not be loaded.',
    );
  }
  return match[1];
}

function validateTarget(args, env) {
  if (env.SUPABASE_PROJECT_ID !== PROJECT_REF) {
    return fail('PROJECT_REF_MISMATCH', 'Strict libpq target project ref is not governed.');
  }
  if (args.principal !== 'postgres.' + PROJECT_REF) {
    return fail('PRINCIPAL_MISMATCH', 'Strict libpq target principal is not governed.');
  }
  if (!POOLER_HOST_PATTERN.test(args.host)) {
    return fail('POOLER_HOST_INVALID', 'Strict libpq target host is not a governed pooler hostname.');
  }
  if (args.port !== PORT || args.database !== DATABASE) {
    return fail('DATABASE_AUTHORITY_MISMATCH', 'Strict libpq target port/database is not governed.');
  }
}

function validateRootCertificate(rootCertificatePem, expectedFingerprint) {
  const normalized = requireNonEmpty(
    rootCertificatePem,
    'ROOT_CERTIFICATE_MISSING',
  );
  for (const marker of PRIVATE_KEY_MARKERS) {
    if (normalized.includes(marker)) {
      return fail(
        'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
        'Strict libpq root certificate must not contain private-key material.',
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
      'Strict libpq requires exactly one PEM encoded root certificate.',
    );
  }
  let certificate;
  try {
    certificate = new X509Certificate(normalized);
  } catch {
    return fail(
      'ROOT_CERTIFICATE_INVALID',
      'Strict libpq root certificate is not valid X.509.',
    );
  }
  if (certificate.ca !== true) {
    return fail(
      'ROOT_CERTIFICATE_NOT_CA',
      'Strict libpq root certificate must be a CA certificate.',
    );
  }
  if (certificate.fingerprint256 !== expectedFingerprint) {
    return fail(
      'ROOT_CERTIFICATE_FINGERPRINT_MISMATCH',
      'Strict libpq root certificate does not match governed authority.',
    );
  }
  return normalized;
}

function validateOutputPath(output, runnerTemp) {
  const requested = requireNonEmpty(output, 'OUTPUT_PATH_MISSING');
  const tempRoot = resolve(requireNonEmpty(runnerTemp, 'RUNNER_TEMP_MISSING'));
  const resolvedOutput = resolve(requested);
  if (!isAbsolute(requested)) {
    return fail('OUTPUT_PATH_INVALID', 'Strict libpq root certificate path must be absolute.');
  }
  const rel = relative(tempRoot, resolvedOutput);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return fail(
      'OUTPUT_PATH_INVALID',
      'Strict libpq root certificate must stay beneath RUNNER_TEMP.',
    );
  }
  return resolvedOutput;
}

export async function prepareProductionPostgresStrictLibpqV1(
  args,
  env = process.env,
) {
  validateTarget(args, env);
  const expectedFingerprint = await loadGovernedFingerprint();
  const rootCertificatePem = validateRootCertificate(
    env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
    expectedFingerprint,
  );
  const outputPath = validateOutputPath(args.output, env.RUNNER_TEMP);
  await writeFile(outputPath, rootCertificatePem + '\n', {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'w',
  });
  await chmod(outputPath, 0o600);
  return Object.freeze({
    projectRef: PROJECT_REF,
    principal: args.principal,
    tlsMode: 'verify-full',
    peerVerification: 'full',
    rootCertificatePinned: true,
    rootCertificateFingerprint256: expectedFingerprint,
    rootCertificatePemEmitted: false,
    databaseUrlEmitted: false,
    credentialMaterialEmitted: false,
  });
}

function printEvidence(evidence) {
  console.log('strict_libpq_authority=pass');
  console.log('project_ref=' + evidence.projectRef);
  console.log('database_principal=' + evidence.principal);
  console.log('tls_mode=' + evidence.tlsMode);
  console.log('peer_verification=' + evidence.peerVerification);
  console.log('root_certificate_pinned=' + evidence.rootCertificatePinned);
  console.log(
    'root_certificate_fingerprint256=' + evidence.rootCertificateFingerprint256,
  );
  console.log('root_certificate_pem_emitted=' + evidence.rootCertificatePemEmitted);
  console.log('database_url_emitted=' + evidence.databaseUrlEmitted);
  console.log('credential_material_emitted=' + evidence.credentialMaterialEmitted);
}

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  try {
    const evidence = await prepareProductionPostgresStrictLibpqV1(
      parseArgs(process.argv.slice(2)),
    );
    printEvidence(evidence);
  } catch (error) {
    const code =
      error instanceof StrictLibpqPreparationError
        ? error.code
        : 'UNEXPECTED_STRICT_LIBPQ_FAILURE';
    console.error('strict_libpq_authority=fail code=' + code);
    process.exitCode = 1;
  }
}
