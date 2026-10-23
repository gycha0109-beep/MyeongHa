// Watchtower-Track: security
// Locked, strictly first-turn zero-source disclosure for a directly owned Node
// HTTP socket. Vercel Fetch Response MUST retain its unconditional G3 fence.
// No positive source, old thread, paid dispatch or historical replay admission.
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type {
  SeyeonOriginalGrantLockedReadV1,
} from './seyeon-node-original-grant-send-boundary-v1.js';

export const SEYEON_FIRST_ZERO_LOCKED_NODE_REVEAL_V1 = Object.freeze({
  version: 'seyeon-first-zero-locked-node-reveal-v1',
  dbAuthority: 'public.qry_seyeon_locked_first_zero_source_reveal_v1',
  supportedTransport: 'node:http.ServerResponse',
  positiveRecordReveal: false,
  historicalReveal: false,
  vercelFetchSupported: false,
} as const);

const READ_FIRST_ZERO_SOURCE_SQL = `
select assistant_text as "assistantText"
from public.qry_seyeon_locked_first_zero_source_reveal_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
)
`.trim();

type AuthorizedRow = Readonly<{ assistantText: unknown }>;

export class SeyeonLockedFirstZeroRevealErrorV1 extends Error {
  constructor() {
    super('Protected Seyeon first response is not available.');
    this.name = 'SeyeonLockedFirstZeroRevealErrorV1';
  }
}

function trustedUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

/**
 * Trusted server only: IDs must come from an already persisted committed Turn,
 * NEVER from incoming JSON. The Node transport's withLockedOriginalGrant
 * callback owns the same live transaction until response.end() has finished.
 *
 * The dedicated DB-owner RPC validates the authenticated canonical Member,
 * exact immutable zero-source Pin, two-message first-turn isolation, absent
 * derived relationship lineage, original committed message and row locks.
 * Zero rows is a DENIAL, not a positive result.
 */
export function createSeyeonLockedFirstZeroNodeRevealV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  serverThreadId: string;
  serverTurnId: string;
  serverAttemptId: string;
}>): SeyeonOriginalGrantLockedReadV1 {
  if (input.verifiedEvidence.kind !== 'member' ||
      !trustedUuid(input.serverThreadId) ||
      !trustedUuid(input.serverTurnId) ||
      !trustedUuid(input.serverAttemptId)) {
    throw new SeyeonLockedFirstZeroRevealErrorV1();
  }

  return async ({ signal, deliver }) => {
    if (signal.aborted) throw new SeyeonLockedFirstZeroRevealErrorV1();

    await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async ({ client, resolvedSubject }) => {
        if (resolvedSubject.subjectKind !== 'member' || signal.aborted) {
          throw new SeyeonLockedFirstZeroRevealErrorV1();
        }

        const result = await client.query<AuthorizedRow>(READ_FIRST_ZERO_SOURCE_SQL, [
          resolvedSubject.subjectId,
          input.serverThreadId,
          input.serverTurnId,
          input.serverAttemptId,
        ]);
        // Do not ever expose a caller-supplied string, ambiguous row, or
        // body produced before the DB Owner secured this live transaction.
        const value = result.rows.length === 1
          ? result.rows[0]?.assistantText
          : null;
        const assistantText = typeof value === 'string' &&
          value.length > 0 && value.trim().length > 0 &&
          Buffer.byteLength(value, 'utf8') <= 65_536
            ? value : null;

        if (signal.aborted) throw new SeyeonLockedFirstZeroRevealErrorV1();
        await deliver(assistantText);
        // A disconnect/deadline after the DB read is not authorization to
        // release the transaction; force rollback instead.
        if (signal.aborted) throw new SeyeonLockedFirstZeroRevealErrorV1();
      },
    });
  };
}
