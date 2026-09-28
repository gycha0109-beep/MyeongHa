import { X509Certificate } from 'node:crypto';

import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from './production-user-data-runtime-config.js';

export const PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1 =
  'myeongha-production-postgres-tls-peer-verification-v1' as const;

export const PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1 = 'verify-full' as const;

export interface ProductionPostgresTlsPeerAuthorityV1 {
  readonly contractVersion:
    typeof PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1;
  readonly projectRef: typeof MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  readonly requiredTlsMode: typeof PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1;
  readonly rootCertificateFingerprint256: string;
}

export interface ProductionPostgresTlsPeerVerificationEvidenceV1 {
  readonly contractVersion:
    typeof PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1;
  readonly projectRef: typeof MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  readonly tlsMode: typeof PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1;
  readonly peerVerification: 'full';
  readonly rejectUnauthorized: true;
  readonly defaultHostnameVerification: true;
  readonly rootCertificateFingerprint256: string;
  readonly rootCertificatePinned: true;
}

export interface ProductionPostgresStrictTlsTargetV1 {
  readonly connectionString: string;
  readonly ssl: Readonly<{
    readonly ca: string;
    readonly rejectUnauthorized: true;
  }>;
  readonly evidence: ProductionPostgresTlsPeerVerificationEvidenceV1;
}

export class ProductionPostgresTlsPeerVerificationErrorV1 extends Error {
  constructor(
    readonly code:
      | 'INVALID_AUTHORITY'
      | 'INVALID_DATABASE_URL'
      | 'TLS_MODE_NOT_VERIFY_FULL'
      | 'AMBIGUOUS_SSL_CONFIGURATION'
      | 'ROOT_CERTIFICATE_MISSING'
      | 'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN'
      | 'ROOT_CERTIFICATE_INVALID'
      | 'ROOT_CERTIFICATE_FINGERPRINT_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'ProductionPostgresTlsPeerVerificationErrorV1';
  }
}

const SHA256_FINGERPRINT_PATTERN =
  /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u;

const LIBPQ_COMPATIBILITY_QUERY_PARAM = 'uselibpqcompat' as const;

const PRIVATE_KEY_MARKERS = Object.freeze([
  '-----BEGIN PRIVATE KEY-----',
  '-----BEGIN ENCRYPTED PRIVATE KEY-----',
  '-----BEGIN RSA PRIVATE KEY-----',
  '-----BEGIN EC PRIVATE KEY-----',
  '-----BEGIN OPENSSH PRIVATE KEY-----',
] as const);

function fail(
  code: ProductionPostgresTlsPeerVerificationErrorV1['code'],
  message: string,
): never {
  throw new ProductionPostgresTlsPeerVerificationErrorV1(code, message);
}

function validateAuthority(
  authority: ProductionPostgresTlsPeerAuthorityV1,
): void {
  if (
    authority.contractVersion !==
    PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1
  ) {
    return fail(
      'INVALID_AUTHORITY',
      'PostgreSQL TLS peer authority contract version is not recognized.',
    );
  }

  if (authority.projectRef !== MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF) {
    return fail(
      'INVALID_AUTHORITY',
      'PostgreSQL TLS peer authority targets a different Supabase project.',
    );
  }

  if (authority.requiredTlsMode !== PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1) {
    return fail(
      'INVALID_AUTHORITY',
      'PostgreSQL TLS peer authority must require verify-full.',
    );
  }

  if (
    !SHA256_FINGERPRINT_PATTERN.test(
      authority.rootCertificateFingerprint256,
    )
  ) {
    return fail(
      'INVALID_AUTHORITY',
      'PostgreSQL TLS peer authority must pin an uppercase colon-delimited SHA-256 certificate fingerprint.',
    );
  }
}

function parseVerifyFullDatabaseUrl(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return fail(
      'INVALID_DATABASE_URL',
      'PostgreSQL strict TLS target requires a valid database URL.',
    );
  }

  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    url.hostname.length === 0 ||
    url.username.length === 0 ||
    url.password.length === 0
  ) {
    return fail(
      'INVALID_DATABASE_URL',
      'PostgreSQL strict TLS target requires postgres credentials and a host.',
    );
  }

  if (
    url.searchParams.get('sslmode')?.trim().toLowerCase() !==
    PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1
  ) {
    return fail(
      'TLS_MODE_NOT_VERIFY_FULL',
      'PostgreSQL strict TLS target requires sslmode=verify-full.',
    );
  }

  for (const parameter of url.searchParams.keys()) {
    const normalizedParameter = parameter.trim().toLowerCase();
    if (
      normalizedParameter !== 'sslmode' &&
      (normalizedParameter.startsWith('ssl') ||
        normalizedParameter === LIBPQ_COMPATIBILITY_QUERY_PARAM)
    ) {
      return fail(
        'AMBIGUOUS_SSL_CONFIGURATION',
        'PostgreSQL strict TLS target forbids additional connection-string SSL configuration.',
      );
    }
  }

  return url;
}

function parsePinnedRootCertificate(
  rootCertificatePem: string,
  expectedFingerprint256: string,
): X509Certificate {
  const normalized = rootCertificatePem.trim();
  if (normalized.length === 0) {
    return fail(
      'ROOT_CERTIFICATE_MISSING',
      'PostgreSQL strict TLS target requires a root certificate.',
    );
  }

  for (const marker of PRIVATE_KEY_MARKERS) {
    if (normalized.includes(marker)) {
      return fail(
        'ROOT_CERTIFICATE_PRIVATE_KEY_FORBIDDEN',
        'PostgreSQL TLS root certificate material must not contain a private key.',
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
      'PostgreSQL strict TLS target requires exactly one PEM encoded X.509 root certificate.',
    );
  }

  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(normalized);
  } catch {
    return fail(
      'ROOT_CERTIFICATE_INVALID',
      'PostgreSQL strict TLS root certificate is not a valid X.509 certificate.',
    );
  }

  if (certificate.fingerprint256 !== expectedFingerprint256) {
    return fail(
      'ROOT_CERTIFICATE_FINGERPRINT_MISMATCH',
      'PostgreSQL strict TLS root certificate does not match the governed SHA-256 fingerprint.',
    );
  }

  return certificate;
}

/**
 * Build the dormant SEC-01 strict TLS target without changing the active
 * Production database binding.
 *
 * node-postgres replaces an explicit ssl object when sslmode/sslrootcert/etc.
 * remain in the connection string. After validating the governed source URL as
 * verify-full, this builder removes sslmode and returns the CA separately with
 * rejectUnauthorized=true. Node's default TLS server-identity verification
 * therefore remains active.
 *
 * Do not log the returned connectionString or ssl.ca fields.
 */
export function buildProductionPostgresStrictTlsTargetV1(input: {
  readonly databaseUrl: string;
  readonly rootCertificatePem: string;
  readonly authority: ProductionPostgresTlsPeerAuthorityV1;
}): ProductionPostgresStrictTlsTargetV1 {
  validateAuthority(input.authority);

  const url = parseVerifyFullDatabaseUrl(input.databaseUrl);
  parsePinnedRootCertificate(
    input.rootCertificatePem,
    input.authority.rootCertificateFingerprint256,
  );

  url.searchParams.delete('sslmode');

  return Object.freeze({
    connectionString: url.toString(),
    ssl: Object.freeze({
      ca: input.rootCertificatePem.trim(),
      rejectUnauthorized: true as const,
    }),
    evidence: Object.freeze({
      contractVersion:
        PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      tlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
      peerVerification: 'full' as const,
      rejectUnauthorized: true as const,
      defaultHostnameVerification: true as const,
      rootCertificateFingerprint256:
        input.authority.rootCertificateFingerprint256,
      rootCertificatePinned: true as const,
    }),
  });
}
