import {
  buildProductionNodePostgresPoolConfigV1,
  createNodePostgresSubjectPoolV1,
  type NodePostgresSubjectPoolOptionsV1,
} from './node-postgres-subject-pool.js';
import {
  parseProductionPostgresRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectExecutionScopeV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import { withCloudflareRequestSubjectScopeV1 } from './cloudflare-request-subject-scope.js';

/**
 * Stage 5 Direct TCP candidate. NOT wired to wrangler.jsonc, the live
 * Worker, a GitHub secret, or an OAuth/authentication endpoint.
 *
 * Never use an arbitrary connection URL, a reusable module-scope Pool, or
 * a client-supplied subject. Input evidence MUST have already been verified
 * by the server's approved Auth/Guest verifier before this can be called.
 *
 * Production activation requires separate Security/API/DB approval and a
 * real Worker TLS peer handshake + Postgres RLS/isolation E2E.
 */
export const CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1: Readonly<
  Required<NodePostgresSubjectPoolOptionsV1>
> = Object.freeze({
  maxConnectionsPerRuntime: 1,
  connectionTimeoutMs: 5_000,
  idleTimeoutMs: 1_000,
  statementTimeoutMs: 5_000,
});

export interface CloudflareDirectPostgresSubjectTransactionInputV1<T> {
  readonly environment: ProductionUserDataRuntimeEnvV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly execute: (scope: PostgresSubjectExecutionScopeV1) => T | Promise<T>;
}

/**
 * Guard order is intentional:
 *  1. Require all named DB/TLS environment values and an unprivileged login.
 *  2. Verify pinned root X509 fingerprint and strict peer target via the
 *     existing Production TLS authority before constructing ANY pg Pool.
 *  3. Construct a one-connection Pool within this request, never globally.
 *  4. Delegate principal preflight, BEGIN/SET LOCAL ROLE, canonical subject
 *     assertion and COMMIT/ROLLBACK to the existing authoritative code.
 *  5. Await Pool.end() on both success and failure; never return the Pool.
 *
 * This is a CANDIDATE implementation, not a Production admission decision.
 */
export async function withCloudflareDirectPostgresSubjectTransactionV1<T>(
  input: CloudflareDirectPostgresSubjectTransactionInputV1<T>,
): Promise<T> {
  const config = parseProductionPostgresRuntimeConfigV1(input.environment);

  // Avoid pg's lazy initialization hiding a TLS/CA authority failure until
  // after request handling begins. This check performs no network I/O.
  const checked = buildProductionNodePostgresPoolConfigV1(
    config,
    CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
  );
  if (
    checked.max !== 1 ||
    checked.ssl === undefined ||
    typeof checked.ssl !== 'object' ||
    checked.ssl === null ||
    checked.ssl.rejectUnauthorized !== true
  ) {
    throw new Error('Cloudflare direct PostgreSQL candidate TLS authority rejected.');
  }

  return withCloudflareRequestSubjectScopeV1({
    createPool: () =>
      createNodePostgresSubjectPoolV1(
        config,
        CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
      ),
    execute: pool =>
      executePostgresSubjectTransactionV1({
        pool,
        verifiedEvidence: input.verifiedEvidence,
        execute: input.execute,
      }),
  });
}
