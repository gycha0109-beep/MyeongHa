import type { PrivateOfficialReaderRecoveryTransactionPortV1 } from './official-reader-private-replay-recovery-v1.js';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

/** No protected source field or mutable privilege is returned. */
export const MINIMAL_UNKNOWN_COMMIT_READ_SQL =
  'select public.qry_official_reader_unknown_commit_minimal_v1(' +
  '$1::uuid,$2::uuid) as "observation"';

export type MinimalOfficialReaderObservationV1 = Readonly<{
  readonly status: 'held';
  readonly reason:
    | 'SOURCE_UNAVAILABLE'
    | 'NO_COMMITTED_EFFECT_VISIBLE'
    | 'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY'
    | 'INCOMPLETE_OR_CONFLICTING_AUTHORITY'
    | 'STALE_SNAPSHOT_UNSUPPORTED';
  readonly automaticRetryAuthorized: false;
  readonly publicDisclosureAuthorized: false;
}>;

function hold(reason: MinimalOfficialReaderObservationV1['reason']):
  MinimalOfficialReaderObservationV1 {
  return Object.freeze({
    status: 'held',
    reason,
    automaticRetryAuthorized: false,
    publicDisclosureAuthorized: false,
  });
}

/**
 * The subjectId MUST come from already-verified server-side member/guest
 * authentication. A UUID or transaction GUC supplied by a browser alone
 * cannot authenticate a user.
 */
export async function observeOfficialReaderUnknownCommitMinimalV1(input: Readonly<{
  readonly transaction: PrivateOfficialReaderRecoveryTransactionPortV1;
  readonly verifiedSubjectId: unknown;
  readonly receiptId: unknown;
}>): Promise<MinimalOfficialReaderObservationV1> {
  if (typeof input.verifiedSubjectId !== 'string' || !UUID.test(input.verifiedSubjectId) ||
      typeof input.receiptId !== 'string' || !UUID.test(input.receiptId)) {
    return hold('SOURCE_UNAVAILABLE');
  }
  try {
    return await input.transaction.execute(async (client) => {
      const result = await client.query<{ observation: unknown }>(
        MINIMAL_UNKNOWN_COMMIT_READ_SQL,
        [input.verifiedSubjectId, input.receiptId],
      );
      if (result.rows.length !== 1) return hold('SOURCE_UNAVAILABLE');
      const candidate = result.rows[0]?.observation;
      switch (candidate) {
        case 'SOURCE_UNAVAILABLE':
        case 'NO_COMMITTED_EFFECT_VISIBLE':
        case 'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY':
        case 'INCOMPLETE_OR_CONFLICTING_AUTHORITY':
        case 'STALE_SNAPSHOT_UNSUPPORTED':
          return hold(candidate);
        default:
          return hold('SOURCE_UNAVAILABLE');
      }
    });
  } catch {
    return hold('SOURCE_UNAVAILABLE');
  }
}
