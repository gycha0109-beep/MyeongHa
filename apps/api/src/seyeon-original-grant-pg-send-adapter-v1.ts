// Watchtower-Track: security
// R13: DB-authoritative Node-send adapter, NOT mounted in Vercel Production.
// G3's current-original-Grant SQL is present only in the named disposable
// PostgreSQL candidate. Owner G0/G3 signatures are still required.
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';
import type {
  SeyeonOriginalGrantLockedReadV1,
} from './seyeon-node-original-grant-send-boundary-v1.js';

export const SEYEON_ORIGINAL_GRANT_PG_SEND_ADAPTER_V1 = Object.freeze({
  version: 'seyeon-original-grant-pg-send-adapter-v1',
  currentRightsSql: 'seyeon_positive_candidate.reveal_http_r5',
  verifiedMemberOnly: true,
  originalAttemptRequired: true,
  readLockTimeoutMs: 2_000,
  statementTimeoutMs: 5_000,
  availableForProduction: false,
} as const);

const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;

// SQL is static; all subject/turn/attempt/message IDs are bound parameters.
// The authority function must lock exact original Record + Grant and verify
// immutable source/Attempt/Message lineage before returning one assistant text.
const READ_CURRENT_ORIGINAL_GRANT_SQL = `
select seyeon_positive_candidate.reveal_http_r5(
  $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid
) as "assistantText"
`.trim();

export class SeyeonOriginalGrantPgSendAdapterErrorV1 extends Error {
  constructor(
    readonly code:
      | 'INVALID_TRUSTED_LOCATOR'
      | 'INVALID_MEMBER_EVIDENCE'
      | 'REUSED_SEND_ATTEMPT'
      | 'SEND_ABORTED'
      | 'INVALID_DB_AUTHORITY',
  ) {
    super('Se-yeon original-Grant DB send boundary is unavailable.');
    this.name = 'SeyeonOriginalGrantPgSendAdapterErrorV1';
  }
}

export interface CreateSeyeonOriginalGrantPgSendAdapterInputV1 {
  /** Already verified server identity. Browser-provided subject IDs forbidden. */
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly pool: PostgresSubjectPoolV1;
  /** Server-owned locators: checked against the DB's committed Attempt. */
  readonly threadId: string;
  readonly turnId: string;
  readonly committedAttemptId: string;
  readonly committedAssistantMessageId: string;
  /** R24 sealed CI candidate: reject any other DB before opening current-rights RPC. */
  readonly expectedDisposableDatabase?: 'myeongha_seyeon_positive_pin_candidate_test';
}

function requireUuid(value: string): string {
  if (!UUID.test(value)) {
    throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
      'INVALID_TRUSTED_LOCATOR',
    );
  }
  return value;
}

function assertLive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new SeyeonOriginalGrantPgSendAdapterErrorV1('SEND_ABORTED');
  }
}

/**
 * Produces the DB transaction callback for R11's actual Node socket sender.
 *
 * The proven resolver enters only the login-approved API role, binds the
 * verified Member to the canonical Subject, and holds that transaction open
 * THROUGH deliver()->Node finish. Only THEN does the transaction COMMIT.
 *
 * Revoke-first reads NULL; send-first holds original Grant/Record SHARE locks
 * until Node finish. SQL errors or aborts ROLLBACK. No cached or regranted
 * response can be substituted, and this callback is single-use.
 *
 * IMPORTANT: The current reveal_http_r5 exists in DISPOSABLE DB ONLY.
 * Vercel Fetch proxy lacks a verified last-hop fence: NO production mount.
 */
export function createSeyeonOriginalGrantPgSendAdapterV1(
  input: CreateSeyeonOriginalGrantPgSendAdapterInputV1,
): SeyeonOriginalGrantLockedReadV1 {
  if (
    input.verifiedEvidence.kind !== 'member' ||
    !UUID.test(input.verifiedEvidence.verifiedAuthUserId)
  ) {
    throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
      'INVALID_MEMBER_EVIDENCE',
    );
  }
  const threadId = requireUuid(input.threadId);
  const turnId = requireUuid(input.turnId);
  const attemptId = requireUuid(input.committedAttemptId);
  const messageId = requireUuid(input.committedAssistantMessageId);
  let used = false;

  return async ({ signal, deliver }) => {
    if (used) {
      throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
        'REUSED_SEND_ATTEMPT',
      );
    }
    used = true;
    assertLive(signal);

    await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async ({ resolvedSubject, client }) => {
        assertLive(signal);
        if (resolvedSubject.subjectKind !== 'member') {
          throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
            'INVALID_MEMBER_EVIDENCE',
          );
        }
        if (input.expectedDisposableDatabase !== undefined) {
          const db = await client.query<{ dbName: unknown }>(
            'select current_database() as "dbName"',
          );
          if (db.rows.length !== 1 ||
              db.rows[0]?.dbName !== input.expectedDisposableDatabase) {
            throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
              'INVALID_DB_AUTHORITY',
            );
          }
          assertLive(signal);
        }

        // Query waits are bounded even if a request aborts while PostgreSQL
        // is waiting on the independent revoke transaction's row lock.
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        assertLive(signal);

        const result = await client.query<{ assistantText: unknown }>(
          READ_CURRENT_ORIGINAL_GRANT_SQL,
          [resolvedSubject.subjectId, threadId, turnId, attemptId, messageId],
        );
        assertLive(signal);

        if (result.rows.length !== 1) {
          throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
            'INVALID_DB_AUTHORITY',
          );
        }
        const value = result.rows[0]?.assistantText;
        if (value !== null && typeof value !== 'string') {
          throw new SeyeonOriginalGrantPgSendAdapterErrorV1(
            'INVALID_DB_AUTHORITY',
          );
        }

        // PostgreSQL's exact original Grant/Record SHARE locks are still
        // held until Node's send callback resolves. Abort/error rolls back.
        await deliver(value);
        assertLive(signal);
      },
    });
  };
}
