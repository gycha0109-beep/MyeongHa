import { createHash } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export const SAJU_SOURCE_PROOF_NONCE_CLAIM_TABLE_V1 =
  'public.saju_source_proof_nonce_claims' as const;
export const SAJU_SOURCE_PROOF_NONCE_CLAIM_ROLE_V1 =
  'myeongha_saju_proof_nonce_runtime' as const;
export const SAJU_SOURCE_PROOF_NONCE_CLAIM_VERSION_V1 =
  'myeongha-saju-source-proof-nonce-claim-postgres-v1' as const;

const MAX_REPLAY_KEY_LENGTH = 512;
const MAX_REMAINING_MS = 135_000;
const CLOCK_SKEW_RETENTION_MS = 30_000;
const REPLAY_KEY_FORMAT = /^[A-Za-z0-9._:-]+$/u;

const CLAIM_SQL = `
insert into public.saju_source_proof_nonce_claims (
  replay_key_digest,
  retained_until
) values (
  $1::text,
  $2::timestamptz
)
on conflict (replay_key_digest) do nothing
returning replay_key_digest
`.trim();

export interface SajuSourceProofNoncePostgresClaimOptionsV1 {
  /**
   * Dedicated trusted PostgreSQL service pool.
   * The connecting role must be allowed to SET LOCAL ROLE
   * myeongha_saju_proof_nonce_runtime. Browser DB clients are forbidden.
   */
  readonly pool: PostgresSubjectPoolV1;
  /** Clock seam for deterministic synthetic tests only. */
  readonly nowMsFactory?: () => number;
}

function replayDigest(replayKey: string): string {
  return createHash('sha256')
    .update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(replayKey)
    .digest('hex');
}

/**
 * A one-statement unique INSERT is the atomic cross-replica claim.
 *
 * This adapter intentionally does not create its schema. Until the database
 * authority track provisions its unique index, RLS/grants and retention job,
 * the query fails closed and no Preview proof can be promoted.
 */
export function createSajuSourceProofPostgresNonceClaimV1(
  options: SajuSourceProofNoncePostgresClaimOptionsV1,
): (replayKey: string, expiresAtMs: number) => Promise<boolean> {
  if (!options.pool || typeof options.pool.connect !== 'function'
    || (options.nowMsFactory !== undefined
      && typeof options.nowMsFactory !== 'function')) {
    throw new TypeError('Invalid Saju source proof nonce database claim configuration.');
  }

  return async (replayKey, expiresAtMs) => {
    const nowMs = (options.nowMsFactory ?? Date.now)();
    if (typeof replayKey !== 'string' || replayKey.length < 25
      || replayKey.length > MAX_REPLAY_KEY_LENGTH
      || !REPLAY_KEY_FORMAT.test(replayKey)
      || !Number.isSafeInteger(expiresAtMs)
      || !Number.isSafeInteger(nowMs)
      || expiresAtMs <= nowMs || expiresAtMs - nowMs > MAX_REMAINING_MS) {
      return false;
    }

    const retainedUntilMs = expiresAtMs + CLOCK_SKEW_RETENTION_MS;
    if (!Number.isSafeInteger(retainedUntilMs)) return false;

    let connection: Awaited<ReturnType<PostgresSubjectPoolV1['connect']>>;
    try {
      connection = await options.pool.connect();
    } catch {
      return false;
    }

    let inTransaction = false;
    let discardConnection: unknown;
    try {
      await connection.query('BEGIN');
      inTransaction = true;
      await connection.query('SET LOCAL ROLE myeongha_saju_proof_nonce_runtime');
      const claimed = await connection.query<{ replay_key_digest: string }>(
        CLAIM_SQL,
        [replayDigest(replayKey), new Date(retainedUntilMs).toISOString()],
      );
      if (claimed.rows.length !== 0 && claimed.rows.length !== 1) {
        throw new Error('Unexpected nonce claim row cardinality.');
      }
      if (claimed.rows.length === 1
        && (typeof claimed.rows[0]?.replay_key_digest !== 'string'
          || claimed.rows[0]?.replay_key_digest !== replayDigest(replayKey))) {
        throw new Error('Nonce claim authority returned a mismatched key.');
      }
      await connection.query('COMMIT');
      inTransaction = false;
      return claimed.rows.length === 1;
    } catch {
      if (inTransaction) {
        try {
          await connection.query('ROLLBACK');
        } catch (rollbackError) {
          discardConnection = rollbackError;
        }
      }
      return false;
    } finally {
      connection.release(discardConnection);
    }
  };
}
