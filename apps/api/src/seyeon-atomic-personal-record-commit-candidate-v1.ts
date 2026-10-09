/**
 * Candidate-only exact-Grant atomic Commit contract (Issue #1843).
 *
 * It deliberately has NO production import, DB SQL, public route or reveal
 * capability. The DB/character-memory owners must supply a trusted, immutable
 * per-attempt provenance store and a same-transaction locking implementation
 * before this can be connected to the real chat commit.
 */
export const SEYEON_ATOMIC_PERSONAL_RECORD_COMMIT_CANDIDATE_V1 =
  'seyeon-atomic-personal-record-commit-candidate-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DIGEST = /^sha256:v1:[a-f0-9]{64}$/u;

export interface SeyeonAtomicPinnedPersonalRecordV1 {
  readonly kind: 'memory' | 'life_fact';
  readonly recordId: string;
  readonly grantId: string;
  readonly recordType: string;
  readonly schemaVersion: string;
  /** Digest of the EXACT server-admitted raw record used to compose context. */
  readonly admittedRecordDigest: string;
}

export interface SeyeonAtomicGrantReadV1 extends SeyeonAtomicPinnedPersonalRecordV1 {}

export class SeyeonAtomicPublicationHoldV1 extends Error {
  override readonly name = 'SeyeonAtomicPublicationHoldV1';
  constructor(readonly code:
    | 'PINNED_PROOF_MISSING'
    | 'PINNED_PROOF_INVALID'
    | 'ATOMIC_GRANT_AUTHORITY_UNAVAILABLE'
    | 'REVOKED_OR_CHANGED_GRANT') {
    super('Se-yeon atomic personal-record publication admission is on hold.');
  }
}

function key(row: SeyeonAtomicPinnedPersonalRecordV1): string {
  return [row.kind, row.recordId, row.grantId].join(':');
}

function valid(row: SeyeonAtomicPinnedPersonalRecordV1): boolean {
  return (row.kind === 'memory' || row.kind === 'life_fact') &&
    UUID.test(row.recordId) && UUID.test(row.grantId) &&
    typeof row.recordType === 'string' && row.recordType.trim() === row.recordType &&
    row.recordType.length > 0 &&
    typeof row.schemaVersion === 'string' &&
    row.schemaVersion.trim() === row.schemaVersion &&
    row.schemaVersion.length > 0 &&
    DIGEST.test(row.admittedRecordDigest);
}

function same(
  a: SeyeonAtomicPinnedPersonalRecordV1,
  b: SeyeonAtomicPinnedPersonalRecordV1,
): boolean {
  return key(a) === key(b) && a.recordType === b.recordType &&
    a.schemaVersion === b.schemaVersion &&
    a.admittedRecordDigest === b.admittedRecordDigest;
}

/**
 * This shapes the intended DB owner integration: the exact-Grant row locks
 * MUST be taken (and held until commit) on the SAME client transaction that
 * executes commitTurn. A separate recheck transaction is not acceptable.
 * The narrow commit callback is only invoked when EVERY original record
 * still has the exact matching active Grant and admitted raw content.
 *
 * A test/candidate transaction is NOT a production authorization to reveal
 * text. In particular, no replay/HTTP reveal hook is provided here.
 */
export async function executeSeyeonAtomicCommitCandidateV1<TClient, TResult>(input: {
  readonly subjectId: string;
  readonly threadId: string;
  readonly attemptId: string;
  /** Server-minted immutable turn provenance, never model/caller text. */
  readonly serverPinnedRecords: readonly SeyeonAtomicPinnedPersonalRecordV1[];
  readonly subjectTransaction: {
    run<T>(subjectId: string, useClient: (client: TClient) => Promise<T>): Promise<T>;
  };
  readonly lockCurrentRecordsInSameTransaction: (
    client: TClient,
    scope: Readonly<{
      subjectId: string;
      characterId: 'seyeon';
      threadId: string;
      attemptId: string;
      serverPinnedRecords: readonly SeyeonAtomicPinnedPersonalRecordV1[];
    }>,
  ) => Promise<readonly SeyeonAtomicGrantReadV1[]>;
  readonly commitTurnInSameTransaction: (
    client: TClient,
  ) => Promise<TResult>;
}): Promise<Readonly<{
  readonly candidateVersion: typeof SEYEON_ATOMIC_PERSONAL_RECORD_COMMIT_CANDIDATE_V1;
  readonly commitResult: TResult;
  readonly checkedRecords: number;
  /** The owner approval is still required for the real DB/HTTP integration. */
  readonly permitsProductionReveal: false;
}>> {
  const records = input.serverPinnedRecords;
  if (!Array.isArray(records) || records.length === 0) {
    throw new SeyeonAtomicPublicationHoldV1('PINNED_PROOF_MISSING');
  }
  if (!UUID.test(input.subjectId) || !UUID.test(input.threadId) ||
      !UUID.test(input.attemptId) ||
      records.some(record => !valid(record)) ||
      new Set(records.map(key)).size !== records.length) {
    throw new SeyeonAtomicPublicationHoldV1('PINNED_PROOF_INVALID');
  }
  const scope = Object.freeze({
    subjectId: input.subjectId,
    characterId: 'seyeon' as const,
    threadId: input.threadId,
    attemptId: input.attemptId,
    serverPinnedRecords: Object.freeze(records.map(record => Object.freeze({ ...record }))),
  });

  return input.subjectTransaction.run(input.subjectId, async (client) => {
    let current: readonly SeyeonAtomicGrantReadV1[];
    try {
      current = await input.lockCurrentRecordsInSameTransaction(client, scope);
    } catch {
      throw new SeyeonAtomicPublicationHoldV1('ATOMIC_GRANT_AUTHORITY_UNAVAILABLE');
    }
    if (!Array.isArray(current) || current.length !== records.length ||
        current.some(record => !valid(record)) ||
        new Set(current.map(key)).size !== records.length ||
        scope.serverPinnedRecords.some(pinned =>
          !current.some(row => same(pinned, row)))) {
      throw new SeyeonAtomicPublicationHoldV1('REVOKED_OR_CHANGED_GRANT');
    }
    const commitResult = await input.commitTurnInSameTransaction(client);
    return Object.freeze({
      candidateVersion: SEYEON_ATOMIC_PERSONAL_RECORD_COMMIT_CANDIDATE_V1,
      commitResult,
      checkedRecords: records.length,
      permitsProductionReveal: false as const,
    });
  });
}
