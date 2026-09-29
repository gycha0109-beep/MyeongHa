import {
  MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
} from './production-account-deletion-worker-db-config.js';
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

export const PRODUCTION_ACCOUNT_DELETION_WORKER_TLS_CONTRACT_VERSION_V1 =
  'myeongha-production-account-deletion-worker-postgres-tls-peer-verification-v1' as const;

export const PRODUCTION_ACCOUNT_DELETION_WORKER_DIRECT_HOST_V1 =
  `db.${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` as const;

export const PRODUCTION_ACCOUNT_DELETION_WORKER_POOLER_HOST_SUFFIX_V1 =
  '.pooler.supabase.com' as const;

export const PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1 =
  `${MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL}.${MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF}` as const;

export type ProductionAccountDeletionWorkerDatabaseEndpointKindV1 =
  | 'direct'
  | 'supavisor';

export interface ProductionAccountDeletionWorkerDatabaseAuthorityEvidenceV1 {
  readonly contractVersion:
    typeof PRODUCTION_ACCOUNT_DELETION_WORKER_TLS_CONTRACT_VERSION_V1;
  readonly projectRef: typeof MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF;
  readonly databasePrincipal:
    typeof MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL;
  readonly endpointKind: ProductionAccountDeletionWorkerDatabaseEndpointKindV1;
  readonly endpointAuthorityPinned: true;
}

export interface ProductionAccountDeletionWorkerStrictTlsTargetV1 {
  readonly connectionString: string;
  readonly ssl: ProductionPostgresStrictTlsTargetV1['ssl'];
  readonly evidence: Readonly<
    ProductionAccountDeletionWorkerDatabaseAuthorityEvidenceV1 & {
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

export class ProductionAccountDeletionWorkerTlsAuthorityErrorV1 extends Error {
  constructor(
    readonly code:
      | 'INVALID_DATABASE_URL'
      | 'WORKER_PRINCIPAL_MISMATCH'
      | 'WORKER_PROJECT_AUTHORITY_MISMATCH'
      | 'WORKER_ENDPOINT_AUTHORITY_MISMATCH'
      | 'STRICT_TLS_TARGET_REJECTED',
    message: string,
  ) {
    super(message);
    this.name = 'ProductionAccountDeletionWorkerTlsAuthorityErrorV1';
  }
}

function fail(
  code: ProductionAccountDeletionWorkerTlsAuthorityErrorV1['code'],
  message: string,
): never {
  throw new ProductionAccountDeletionWorkerTlsAuthorityErrorV1(code, message);
}

function isGovernedPoolerHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized.endsWith(
      PRODUCTION_ACCOUNT_DELETION_WORKER_POOLER_HOST_SUFFIX_V1,
    ) &&
    normalized.length >
      PRODUCTION_ACCOUNT_DELETION_WORKER_POOLER_HOST_SUFFIX_V1.length
  );
}

export function inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(
  databaseUrl: string,
): ProductionAccountDeletionWorkerDatabaseAuthorityEvidenceV1 {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return fail(
      'INVALID_DATABASE_URL',
      'Account-deletion worker PostgreSQL authority requires a valid database URL.',
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
      'Account-deletion worker PostgreSQL authority requires credentials and a host.',
    );
  }

  let decodedUser: string;
  try {
    decodedUser = decodeURIComponent(url.username);
  } catch {
    return fail(
      'WORKER_PRINCIPAL_MISMATCH',
      'Account-deletion worker PostgreSQL username is invalid.',
    );
  }

  const normalizedHost = url.hostname.toLowerCase();

  if (decodedUser === MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL) {
    if (normalizedHost !== PRODUCTION_ACCOUNT_DELETION_WORKER_DIRECT_HOST_V1) {
      return fail(
        'WORKER_ENDPOINT_AUTHORITY_MISMATCH',
        'Direct account-deletion worker PostgreSQL authority must target the governed Production project host.',
      );
    }

    return Object.freeze({
      contractVersion:
        PRODUCTION_ACCOUNT_DELETION_WORKER_TLS_CONTRACT_VERSION_V1,
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      databasePrincipal:
        MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
      endpointKind: 'direct' as const,
      endpointAuthorityPinned: true as const,
    });
  }

  if (
    decodedUser.startsWith(
      `${MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL}.`,
    )
  ) {
    if (
      decodedUser !==
      PRODUCTION_ACCOUNT_DELETION_WORKER_SUPAVISOR_USERNAME_V1
    ) {
      return fail(
        'WORKER_PROJECT_AUTHORITY_MISMATCH',
        'Account-deletion worker Supavisor username targets a different project.',
      );
    }

    if (!isGovernedPoolerHost(normalizedHost)) {
      return fail(
        'WORKER_ENDPOINT_AUTHORITY_MISMATCH',
        'Account-deletion worker Supavisor authority must target a Supabase pooler host.',
      );
    }

    return Object.freeze({
      contractVersion:
        PRODUCTION_ACCOUNT_DELETION_WORKER_TLS_CONTRACT_VERSION_V1,
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      databasePrincipal:
        MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_PRINCIPAL,
      endpointKind: 'supavisor' as const,
      endpointAuthorityPinned: true as const,
    });
  }

  return fail(
    'WORKER_PRINCIPAL_MISMATCH',
    'Account-deletion worker PostgreSQL URL must use the dedicated worker login principal.',
  );
}

type StrictTargetBuilderV1 = (
  input: Parameters<typeof buildProductionPostgresStrictTlsTargetV1>[0],
) => Pick<ProductionPostgresStrictTlsTargetV1, 'connectionString' | 'ssl' | 'evidence'>;

export function buildProductionAccountDeletionWorkerStrictTlsTargetV1(
  input: {
    readonly databaseUrl: string;
    readonly rootCertificatePem: string;
  },
  dependencies: Readonly<{
    buildStrictTarget?: StrictTargetBuilderV1;
  }> = {},
): ProductionAccountDeletionWorkerStrictTlsTargetV1 {
  const workerAuthority =
    inspectProductionAccountDeletionWorkerDatabaseAuthorityV1(
      input.databaseUrl,
    );

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
      databaseUrl: input.databaseUrl,
      rootCertificatePem: input.rootCertificatePem,
      authority,
    });
  } catch {
    return fail(
      'STRICT_TLS_TARGET_REJECTED',
      'Account-deletion worker PostgreSQL strict TLS target was rejected.',
    );
  }

  return Object.freeze({
    connectionString: target.connectionString,
    ssl: target.ssl,
    evidence: Object.freeze({
      ...workerAuthority,
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
