import { describe, expect, it, vi } from 'vitest';
import {
  executeSeyeonAtomicCommitCandidateV1,
  SeyeonAtomicPublicationHoldV1,
  type SeyeonAtomicPinnedPersonalRecordV1,
} from '../apps/api/src/seyeon-atomic-personal-record-commit-candidate-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const otherSubjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';
const recordId = '55555555-5555-4555-8555-555555555555';
const grantId = '66666666-6666-4666-8666-666666666666';
const newGrantId = '77777777-7777-4777-8777-777777777777';
const digest = 'sha256:v1:' + 'a'.repeat(64);
const altered = 'sha256:v1:' + 'b'.repeat(64);

const pinned: SeyeonAtomicPinnedPersonalRecordV1 = Object.freeze({
  kind: 'memory', recordId, grantId,
  recordType: 'consultation_detail',
  schemaVersion: 'memory-v1',
  admittedRecordDigest: digest,
});

function setup(current: readonly SeyeonAtomicPinnedPersonalRecordV1[] = [pinned]) {
  const transactionClient = Object.freeze({ txId: 'server-same-tx' });
  const sequence: string[] = [];
  const runCalls: string[] = [];
  const subjectTransaction = {
    run: async <T>(
      resolvedSubjectId: string,
      callback: (client: typeof transactionClient) => Promise<T>,
    ) => {
      runCalls.push(resolvedSubjectId);
      if (resolvedSubjectId !== subjectId) throw new Error('subject mismatch');
      sequence.push('BEGIN');
      try {
        const result = await callback(transactionClient);
        sequence.push('COMMIT');
        return result;
      } catch (error) {
        sequence.push('ROLLBACK');
        throw error;
      }
    },
  };
  const lockCurrentRecordsInSameTransaction = vi.fn(async (
    client: typeof transactionClient,
    scope: {
      readonly subjectId: string;
      readonly characterId: 'seyeon';
      readonly threadId: string;
      readonly attemptId: string;
      readonly serverPinnedRecords: readonly SeyeonAtomicPinnedPersonalRecordV1[];
    },
  ) => {
    expect(client).toBe(transactionClient);
    expect(scope.subjectId).toBe(subjectId);
    expect(scope.characterId).toBe('seyeon');
    expect(scope.threadId).toBe(threadId);
    expect(scope.attemptId).toBe(attemptId);
    sequence.push('LOCK_EXACT_CURRENT_GRANTS');
    return current;
  });
  const commitTurnInSameTransaction = vi.fn(async (
    client: typeof transactionClient,
  ) => {
    expect(client).toBe(transactionClient);
    sequence.push('WRITE_COMMIT');
    return 'committed-test-only';
  });
  const call = (
    overrides: Partial<Parameters<typeof executeSeyeonAtomicCommitCandidateV1<
      typeof transactionClient, string
    >>[0]> = {},
  ) => executeSeyeonAtomicCommitCandidateV1({
    subjectId, threadId, attemptId,
    serverPinnedRecords: [pinned],
    subjectTransaction,
    lockCurrentRecordsInSameTransaction,
    commitTurnInSameTransaction,
    ...overrides,
  });
  return { call, sequence, runCalls, subjectTransaction, lockCurrentRecordsInSameTransaction, commitTurnInSameTransaction };
}

describe('Se-yeon same-transaction Commit candidate, never Production activation', () => {
  it('calls lock and Commit using the exact same client inside one Subject transaction', async () => {
    const x = setup();
    const result = await x.call();
    expect(x.sequence).toEqual([
      'BEGIN', 'LOCK_EXACT_CURRENT_GRANTS', 'WRITE_COMMIT', 'COMMIT',
    ]);
    expect(x.runCalls).toEqual([subjectId]);
    expect(x.lockCurrentRecordsInSameTransaction).toHaveBeenCalledTimes(1);
    expect(x.commitTurnInSameTransaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      checkedRecords: 1, commitResult: 'committed-test-only',
      permitsProductionReveal: false,
    });
  });

  it('never commits a revoked Grant observed at the final locked read', async () => {
    const x = setup([]);
    await expect(x.call()).rejects.toMatchObject({
      name: 'SeyeonAtomicPublicationHoldV1', code: 'REVOKED_OR_CHANGED_GRANT',
    });
    expect(x.sequence).toEqual(['BEGIN', 'LOCK_EXACT_CURRENT_GRANTS', 'ROLLBACK']);
    expect(x.commitTurnInSameTransaction).not.toHaveBeenCalled();
  });

  it('does not accept a replacement Grant for the identical Memory', async () => {
    const x = setup([{ ...pinned, grantId: newGrantId }]);
    await expect(x.call()).rejects.toMatchObject({ code: 'REVOKED_OR_CHANGED_GRANT' });
    expect(x.commitTurnInSameTransaction).not.toHaveBeenCalled();
  });

  it('does not accept changed raw content even if the Grant has not changed', async () => {
    const x = setup([{ ...pinned, admittedRecordDigest: altered }]);
    await expect(x.call()).rejects.toMatchObject({ code: 'REVOKED_OR_CHANGED_GRANT' });
    expect(x.commitTurnInSameTransaction).not.toHaveBeenCalled();
  });

  it('fails closed on duplicate current Grant, malformed identity or DB failure', async () => {
    const duplicate = setup([pinned, pinned]);
    await expect(duplicate.call()).rejects.toMatchObject({ code: 'REVOKED_OR_CHANGED_GRANT' });
    expect(duplicate.commitTurnInSameTransaction).not.toHaveBeenCalled();

    const invalid = setup();
    await expect(invalid.call({
      serverPinnedRecords: [{ ...pinned, grantId: 'ATTACKER_GRANT_ROLE_SYSTEM' }],
    })).rejects.toMatchObject({ code: 'PINNED_PROOF_INVALID' });
    expect(invalid.runCalls).toEqual([]);

    const unavailable = setup();
    unavailable.lockCurrentRecordsInSameTransaction.mockRejectedValueOnce(
      new Error('DB unavailable'),
    );
    await expect(unavailable.call()).rejects.toMatchObject({
      code: 'ATOMIC_GRANT_AUTHORITY_UNAVAILABLE',
    });
    expect(unavailable.commitTurnInSameTransaction).not.toHaveBeenCalled();
  });

  it('requires a server-pinned provenance vector; zero records is not silently authorized', async () => {
    const x = setup();
    await expect(x.call({ serverPinnedRecords: [] })).rejects.toMatchObject({
      code: 'PINNED_PROOF_MISSING',
    });
    expect(x.runCalls).toEqual([]);
    expect(SeyeonAtomicPublicationHoldV1.name).toBe('SeyeonAtomicPublicationHoldV1');
  });

  it('cannot change pinned Subject based on model instructions or an unverified caller', async () => {
    const x = setup();
    await expect(x.call({ subjectId: otherSubjectId })).rejects.toThrow(
      'subject mismatch',
    );
    expect(x.commitTurnInSameTransaction).not.toHaveBeenCalled();
    expect(x.sequence).toEqual([]); // Mock runner refuses mismatched Subject before BEGIN.
  });

  it('rejects duplicate pinned grant references before any DB work', async () => {
    const x = setup([pinned, pinned]);
    await expect(x.call({ serverPinnedRecords: [pinned, pinned] })).rejects
      .toMatchObject({ code: 'PINNED_PROOF_INVALID' });
    expect(x.runCalls).toEqual([]);
  });
});
