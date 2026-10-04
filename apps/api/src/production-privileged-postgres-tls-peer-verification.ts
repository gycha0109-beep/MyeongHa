import {
  PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
  PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
  PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
  buildProductionPostgresStrictTlsTargetV1,
  type ProductionPostgresStrictTlsTargetV1,
  type ProductionPostgresTlsPeerAuthorityV1,
} from './production-postgres-tls-peer-verification.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
} from './production-user-data-runtime-config.js';

export const PRODUCTION_PRIVILEGED_POSTGRES_TLS_CONTRACT_VERSION_V1 =
  'myeongha-production-privileged-postgres-tls-peer-verification-v1' as const;

export const PRODUCTION_PRIVILEGED_POSTGRES_PRINCIPAL_V1 =
  `postgres.${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}` as const;

export const PRODUCTION_PRIVILEGED_POSTGRES_DATABASE_V1 = 'postgres' as const;
export const PRODUCTION_PRIVILEGED_POSTGRES_PORT_V1 = '5432' as const;
export const PRODUCTION_PRIVILEGED_POSTGRES_POOLER_HOST_SUFFIX_V1 =
  '.pooler.supabase.com' as const;

export interface ProductionPrivilegedPostgresAuthorityEvidenceV1 {
  readonly contractVersion:
    typeof PRODUCTION_PRIVILEGED_POSTGRES_TLS_CONTRACT_VERSION_V1;
  readonly projectRef: typeof MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  readonly databasePrincipal: typeof PRODUCTION_PRIVILEGED_POSTGRES_PRINCIPAL_V1;
  readonly databaseName: typeof PRODUCTION_PRIVILEGED_POSTGRES_DATABASE_V1;
  readonly databasePort: typeof PRODUCTION_PRIVILEGED_POSTGRES_PORT_V1;
  readonly endpointKind: 'supavisor';
  readonly endpointAuthorityPinned: true;
}

export interface ProductionPrivilegedPostgresStrictTlsTargetV1 {
  readonly connectionString: string;
  readonly ssl: ProductionPostgresStrictTlsTargetV1['ssl'];
  readonly evidence: Readonly<
    ProductionPrivilegedPostgresAuthorityEvidenceV1 & {
      readonly tlsMode: typeof PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1;
      readonly peerVerification: 'full';
      readonly rejectUnauthorized: true;
      readonly defaultHostnameVerification: true;
      readonly rootCertificateFingerprint256:
        typeof PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1;
      readonly rootCertificatePinned: true;
    }
  >;
}

export class ProductionPrivilegedPostgresTlsAuthorityErrorV1 extends Error {
  constructor(
    readonly code:
      | 'INVALID_DATABASE_URL'
      | 'ADMIN_PRINCIPAL_MISMATCH'
      | 'ADMIN_PROJECT_AUTHORITY_MISMATCH'
      | 'ADMIN_ENDPOINT_AUTHORITY_MISMATCH'
      | 'ADMIN_DATABASE_AUTHORITY_MISMATCH'
      | 'TLS_MODE_UNSUPPORTED'
      | 'STRICT_TLS_TARGET_REJECTED',
    message: string,
  ) {
    super(message);
    this.name = 'ProductionPrivilegedPostgresTlsAuthorityErrorV1';
  }
}

function fail(
  code: ProductionPrivilegedPostgresTlsAuthorityErrorV1['code'],
  message: string,
): never {
  throw new ProductionPrivilegedPostgresTlsAuthorityErrorV1(code, message);
}

function isGovernedPoolerHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith(PRODUCTION_PRIVILEGED_POSTGRES_POOLER_HOST_SUFFIX_V1) &&
    normalized.length >
      PRODUCTION_PRIVILEGED_POSTGRES_POOLER_HOST_SUFFIX_V1.length
  );
}

function parseAuthorityUrl(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return fail(
      'INVALID_DATABASE_URL',
      'Privileged Production PostgreSQL authority requires a valid database URL.',
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
      'Privileged Production PostgreSQL authority requires credentials and a host.',
    );
  }

  return url;
}

export function inspectProductionPrivilegedPostgresAuthorityV1(
  databaseUrl: string,
): ProductionPrivilegedPostgresAuthorityEvidenceV1 {
  const url = parseAuthorityUrl(databaseUrl);

  let decodedUser: string;
  try {
    decodedUser = decodeURIComponent(url.username);
  } catch {
    return fail(
      'ADMIN_PRINCIPAL_MISMATCH',
      'Privileged Production PostgreSQL username is invalid.',
    );
  }

  if (!decodedUser.startsWith('postgres.')) {
    return fail(
      'ADMIN_PRINCIPAL_MISMATCH',
      'Privileged Production PostgreSQL URL must use the project-qualified postgres login.',
    );
  }
  if (decodedUser !== PRODUCTION_PRIVILEGED_POSTGRES_PRINCIPAL_V1) {
    return fail(
      'ADMIN_PROJECT_AUTHORITY_MISMATCH',
      'Privileged Production PostgreSQL login targets a different project.',
    );
  }

  if (!isGovernedPoolerHost(url.hostname)) {
    return fail(
      'ADMIN_ENDPOINT_AUTHORITY_MISMATCH',
      'Privileged Production PostgreSQL authority must target a governed Supabase pooler host.',
    );
  }

  const effectivePort =
    url.port.length === 0 ? PRODUCTION_PRIVILEGED_POSTGRES_PORT_V1 : url.port;
  if (effectivePort !== PRODUCTION_PRIVILEGED_POSTGRES_PORT_V1) {
    return fail(
      'ADMIN_ENDPOINT_AUTHORITY_MISMATCH',
      'Privileged Production PostgreSQL authority must use the governed pooler port.',
    );
  }

  if (url.pathname !== `/${PRODUCTION_PRIVILEGED_POSTGRES_DATABASE_V1}`) {
    return fail(
      'ADMIN_DATABASE_AUTHORITY_MISMATCH',
      'Privileged Production PostgreSQL authority must target the governed postgres database.',
    );
  }

  return Object.freeze({
    contractVersion: PRODUCTION_PRIVILEGED_POSTGRES_TLS_CONTRACT_VERSION_V1,
    projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
    databasePrincipal: PRODUCTION_PRIVILEGED_POSTGRES_PRINCIPAL_V1,
    databaseName: PRODUCTION_PRIVILEGED_POSTGRES_DATABASE_V1,
    databasePort: PRODUCTION_PRIVILEGED_POSTGRES_PORT_V1,
    endpointKind: 'supavisor' as const,
    endpointAuthorityPinned: true as const,
  });
}

function buildStrictMigrationTargetUrl(databaseUrl: string): string {
  const url = parseAuthorityUrl(databaseUrl);
  const sourceMode = url.searchParams.get('sslmode')?.trim().toLowerCase();
  if (sourceMode !== 'require' && sourceMode !== 'verify-full') {
    return fail(
      'TLS_MODE_UNSUPPORTED',
      'Privileged Production PostgreSQL strict TLS accepts only the governed require migration source or verify-full source.',
    );
  }

  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.trim().toLowerCase();
    if (normalized.startsWith('ssl') || normalized === 'uselibpqcompat') {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.set('sslmode', PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1);
  return url.toString();
}

type StrictTargetBuilderV1 = (
  input: Parameters<typeof buildProductionPostgresStrictTlsTargetV1>[0],
) => Pick<ProductionPostgresStrictTlsTargetV1, 'connectionString' | 'ssl' | 'evidence'>;

export function buildProductionPrivilegedPostgresStrictTlsTargetV1(
  input: Readonly<{
    databaseUrl: string;
    rootCertificatePem: string;
  }>,
  dependencies: Readonly<{
    buildStrictTarget?: StrictTargetBuilderV1;
  }> = {},
): ProductionPrivilegedPostgresStrictTlsTargetV1 {
  const privilegedAuthority =
    inspectProductionPrivilegedPostgresAuthorityV1(input.databaseUrl);

  const authority: ProductionPostgresTlsPeerAuthorityV1 = Object.freeze({
    contractVersion:
      PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
    projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
    requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
    rootCertificateFingerprint256:
      PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
  });

  let target: Pick<
    ProductionPostgresStrictTlsTargetV1,
    'connectionString' | 'ssl' | 'evidence'
  >;
  try {
    target = (
      dependencies.buildStrictTarget ??
      buildProductionPostgresStrictTlsTargetV1
    )({
      databaseUrl: buildStrictMigrationTargetUrl(input.databaseUrl),
      rootCertificatePem: input.rootCertificatePem,
      authority,
    });
  } catch (error) {
    if (error instanceof ProductionPrivilegedPostgresTlsAuthorityErrorV1) {
      throw error;
    }
    return fail(
      'STRICT_TLS_TARGET_REJECTED',
      'Privileged Production PostgreSQL strict TLS target was rejected.',
    );
  }

  return Object.freeze({
    connectionString: target.connectionString,
    ssl: target.ssl,
    evidence: Object.freeze({
      ...privilegedAuthority,
      tlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
      peerVerification: 'full' as const,
      rejectUnauthorized: true as const,
      defaultHostnameVerification: true as const,
      rootCertificateFingerprint256:
        PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
      rootCertificatePinned: true as const,
    }),
  });
}
