import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  GuestBootstrapAuthorityPortErrorV1,
  type GuestBootstrapAuthorityPortV1,
  type GuestBootstrapAuthorityRowV1,
  type GuestBootstrapIdentityResolverPortV1,
  type GuestBootstrapTokenFingerprintPortV1,
  type ReusableBootstrapIdentityV1,
} from './guest-bootstrap-command.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import {
  createProductionGuestBearerTokenFingerprintPortV1,
  createProductionRequestIdentityVerifierV1,
  type CreateProductionRequestIdentityVerifierInputV1,
} from './production-request-identity-verifier.js';
import type { ProductionUserDataRuntimeConfigV1 } from './production-user-data-runtime-config.js';

export const PRODUCTION_GUEST_BOOTSTRAP_RUNTIME_BINDINGS_V1 = Object.freeze({
  executionRole: 'myeongha_api_executor',
  createGuestSession: 'public.cmd_create_guest_session_runtime_v1',
  readCurrentGuestSession: 'public.qry_guest_bootstrap_current_v1',
} as const);

const BEGIN_SQL = 'BEGIN';
const ENTER_EXECUTION_ROLE_SQL = 'SET LOCAL ROLE myeongha_api_executor';
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';

const CREATE_GUEST_SESSION_SQL = `
select
  subject_id::text as "subjectId",
  guest_session_id::text as "guestSessionId",
  expires_at::text as "expiresAt",
  replayed
from public.cmd_create_guest_session_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::timestamptz
)
`.trim();

const READ_CURRENT_GUEST_SESSION_SQL = `
select
  subject_id::text as "subjectId",
  guest_session_id::text as "guestSessionId",
  expires_at::text as "expiresAt"
from public.qry_guest_bootstrap_current_v1($1::uuid)
`.trim();

type GuestBootstrapAuthorityDbRowV1 = Readonly<{
  subjectId: unknown;
  guestSessionId: unknown;
  expiresAt: unknown;
  replayed: unknown;
}>;

type CurrentGuestBootstrapDbRowV1 = Readonly<{
  subjectId: unknown;
  guestSessionId: unknown;
  expiresAt: unknown;
}>;

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function readPostgresMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

function requireDbText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Production Guest bootstrap PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireDbTimestamp(name: string, value: unknown): string {
  const text = requireDbText(name, value);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`Production Guest bootstrap PostgreSQL ${name} is not a timestamp.`);
  }
  return text;
}

function requireAuthorityRows(
  rows: readonly GuestBootstrapAuthorityDbRowV1[],
): readonly GuestBootstrapAuthorityRowV1[] {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Production Guest bootstrap PostgreSQL authority did not return exactly one row.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Production Guest bootstrap PostgreSQL authority returned an invalid replay marker.');
  }

  return Object.freeze([
    Object.freeze({
      subjectId: requireDbText('subject id', row.subjectId),
      guestSessionId: requireDbText('guest session id', row.guestSessionId),
      expiresAt: requireDbTimestamp('guest session expiry', row.expiresAt),
      replayed: row.replayed,
    }),
  ]);
}

function requireCurrentGuestIdentity(
  rows: readonly CurrentGuestBootstrapDbRowV1[],
  expectedSubjectId: string,
): ReusableBootstrapIdentityV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Production Guest bootstrap current-session query did not return exactly one row.');
  }

  const subjectId = requireDbText('current subject id', row.subjectId);
  if (subjectId !== expectedSubjectId) {
    throw new Error('Production Guest bootstrap current-session query returned a different subject.');
  }

  return Object.freeze({
    kind: 'guest',
    subjectId,
    guestSessionId: requireDbText('current guest session id', row.guestSessionId),
    expiresAt: requireDbTimestamp('current guest session expiry', row.expiresAt),
  });
}

function mapCreateAuthorityError(error: unknown): never {
  if (isPostgresConstraint(error, 'guest_bootstrap_runtime_verifier_format')) {
    throw new GuestBootstrapAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Production Guest bootstrap verifier format was rejected.',
    );
  }

  const message = readPostgresMessage(error);
  if (
    message?.includes('guest bootstrap identity already exists with different canonical input') ||
    message?.includes('guest bootstrap identity conflict')
  ) {
    throw new GuestBootstrapAuthorityPortErrorV1(
      'IDENTITY_CONFLICT',
      'Production Guest bootstrap identity collided with existing authority.',
    );
  }
  if (message?.includes('guest session is no longer an active reusable guest identity')) {
    throw new GuestBootstrapAuthorityPortErrorV1(
      'SESSION_NOT_REUSABLE',
      'Production Guest bootstrap session is no longer reusable.',
    );
  }
  if (
    message?.includes('guest subject id is required') ||
    message?.includes('guest session id is required') ||
    message?.includes('guest token verifier fingerprint is required') ||
    message?.includes('guest session expiry must be in the future')
  ) {
    throw new GuestBootstrapAuthorityPortErrorV1(
      'INVALID_INPUT',
      'Production Guest bootstrap trusted input was rejected.',
    );
  }

  throw error;
}

export class PostgresGuestBootstrapAuthorityPortV1
  implements GuestBootstrapAuthorityPortV1
{
  constructor(private readonly pool: PostgresSubjectPoolV1) {}

  async createGuestSession(input: {
    readonly subjectId: string;
    readonly guestSessionId: string;
    readonly tokenHash: string;
    readonly expiresAt: string;
  }): Promise<readonly GuestBootstrapAuthorityRowV1[]> {
    const connection = await this.pool.connect();
    let transactionStarted = false;
    let discardConnectionError: unknown;

    try {
      await connection.query(BEGIN_SQL);
      transactionStarted = true;
      await connection.query(ENTER_EXECUTION_ROLE_SQL);

      const result = await connection.query<GuestBootstrapAuthorityDbRowV1>(
        CREATE_GUEST_SESSION_SQL,
        [input.subjectId, input.guestSessionId, input.tokenHash, input.expiresAt],
      );
      const rows = requireAuthorityRows(result.rows);

      await connection.query(COMMIT_SQL);
      transactionStarted = false;
      return rows;
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.query(ROLLBACK_SQL);
        } catch (rollbackError) {
          discardConnectionError = rollbackError;
          throw new AggregateError(
            [error, rollbackError],
            'Production Guest bootstrap transaction failed and rollback also failed.',
          );
        }
      }
      return mapCreateAuthorityError(error);
    } finally {
      connection.release(discardConnectionError);
    }
  }
}

export interface CreateProductionGuestBootstrapIdentityResolverInputV1 {
  readonly request: Request;
  readonly identityVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

export function createProductionGuestBootstrapIdentityResolverPortV1(
  input: CreateProductionGuestBootstrapIdentityResolverInputV1,
): GuestBootstrapIdentityResolverPortV1 {
  return Object.freeze({
    async resolveExistingBootstrapIdentity(): Promise<ReusableBootstrapIdentityV1 | null> {
      const hasAuthorization = input.request.headers.get('authorization') !== null;
      if (!hasAuthorization) return null;

      const verifiedEvidence = await input.identityVerifier.verifyRequestIdentity(input.request);
      if (verifiedEvidence === null) {
        throw new ApiCommandError(
          'AUTH_REQUIRED',
          'A supplied session credential must be valid before Guest bootstrap can continue.',
        );
      }

      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence,
        async execute({ resolvedSubject, client }) {
          if (resolvedSubject.subjectKind === 'member') {
            return Object.freeze({
              kind: 'member' as const,
              subjectId: resolvedSubject.subjectId,
            });
          }

          try {
            const result = await client.query<CurrentGuestBootstrapDbRowV1>(
              READ_CURRENT_GUEST_SESSION_SQL,
              [resolvedSubject.subjectId],
            );
            return requireCurrentGuestIdentity(result.rows, resolvedSubject.subjectId);
          } catch (error) {
            if (isPostgresConstraint(error, 'guest_bootstrap_current_unresolved')) {
              throw new ApiCommandError(
                'AUTH_REQUIRED',
                'The supplied Guest session is no longer current.',
              );
            }
            throw error;
          }
        },
      });
    },
  });
}

export interface CreateProductionGuestBootstrapRuntimePortsInputV1 {
  readonly request: Request;
  readonly config: ProductionUserDataRuntimeConfigV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: CreateProductionRequestIdentityVerifierInputV1['memberFetchImpl'];
}

export interface ProductionGuestBootstrapRuntimePortsV1 {
  readonly identityResolverPort: GuestBootstrapIdentityResolverPortV1;
  readonly tokenFingerprintPort: GuestBootstrapTokenFingerprintPortV1;
  readonly authorityPort: GuestBootstrapAuthorityPortV1;
}

/**
 * Composes only the policy-independent production Guest bootstrap ports.
 * Credential issuance/TTL remains an explicit caller dependency and is therefore
 * not silently selected by this runtime foundation.
 */
export function createProductionGuestBootstrapRuntimePortsV1(
  input: CreateProductionGuestBootstrapRuntimePortsInputV1,
): ProductionGuestBootstrapRuntimePortsV1 {
  const identityVerifier = createProductionRequestIdentityVerifierV1({
    config: input.config,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    identityResolverPort: createProductionGuestBootstrapIdentityResolverPortV1({
      request: input.request,
      identityVerifier,
      pool: input.pool,
    }),
    tokenFingerprintPort: createProductionGuestBearerTokenFingerprintPortV1(input.config),
    authorityPort: new PostgresGuestBootstrapAuthorityPortV1(input.pool),
  });
}

export type { IdentityEvidenceVerificationPortV1, PostgresTransactionQueryV1 };
