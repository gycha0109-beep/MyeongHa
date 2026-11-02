import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const state = vi.hoisted(() => ({
  current: true,
  revokeAtCommit: false,
  transactions: 0,
  leaseChecks: 0,
  privateSelects: 0,
  decrypts: 0,
}));

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';
const MARKER = '33333333-3333-4333-8333-333333333333';
const BODY = '44444444-4444-4444-8444-444444444444';
const TURN = '55555555-5555-4555-8555-555555555555';
const ATTEMPT = '66666666-6666-4666-8666-666666666666';
const READING = '77777777-7777-4777-8777-777777777777';
const BUNDLE = '88888888-8888-4888-8888-888888888888';
const RELEASE = '99999999-9999-4999-8999-999999999999';
const GRANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SECRET = 'PAID_PRIVATE_ANSWER_MUST_NOT_LEAK_AFTER_RESTORE_TOMBSTONE';
const KEY_REF = 'reader-dek-v1:' + BODY;

vi.mock('../apps/api/src/postgres-subject-execution.js', () => ({
  executePostgresSubjectTransactionV1: async (input: {
    execute: (scope: unknown) => Promise<unknown>;
  }) => {
    state.transactions++;
    const result = await input.execute({
      resolvedSubject: { subjectId: SUBJECT, subjectKind: 'member' },
      client: {
        query: async () => {
          state.privateSelects++;
          return { rows: [{
            bodyId: BODY,
            threadId: THREAD,
            turnId: TURN,
            attemptId: ATTEMPT,
            safeMessageId: MARKER,
            officialReadingId: READING,
            readerCharacterId: 'seyeon',
            readerContentBundleId: BUNDLE,
            contentReleaseId: RELEASE,
            originatingGrantId: GRANT,
            productId: PRODUCT,
            sourceResponseHash: 'sha256:v1:' + 'a'.repeat(64),
            encryptionSchemeVersion: 'test-cipher',
            encryptionKeyRef: KEY_REF,
            encryptionIv: new Uint8Array([1]),
            encryptionAuthTag: new Uint8Array([2]),
            encryptedBody: new Uint8Array([3]),
            committedAt: '2026-10-25T12:00:00.000Z',
          }] };
        },
      },
    });
    // Privacy revoke/restore can race while PostgreSQL COMMIT/release finishes.
    if (state.transactions === 2 && state.revokeAtCommit) {
      state.current = false;
    }
    return result;
  },
}));

vi.mock('../apps/api/src/official-reader-private-privacy-ledger-v1.js', () => ({
  currentOfficialReaderPrivacyReadLeaseV1: () => {
    state.leaseChecks++;
    return state.current;
  },
}));

vi.mock('../apps/api/src/official-reader-private-paid-answer-query-v1.js', () => ({
  selectPrivateOfficialReaderCiphertextQueryV1: () => ({
    sql: 'select private held S6 ciphertext',
    values: [SUBJECT, THREAD, MARKER],
  }),
}));

vi.mock('../apps/api/src/official-reader-private-exact-verified-purchase-guard-v1.js', () => ({
  assertOfficialReaderPrivateCurrentVerifiedPurchaseScopeV1: async () => undefined,
}));

vi.mock('../apps/api/src/official-reader-protected-body-crypto-v1.js', () => ({
  OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1: 'test-cipher',
  decryptOfficialReaderProtectedBodyV1: () => {
    state.decrypts++;
    return SECRET;
  },
}));

import { readPrivateOfficialReaderPaidChatMessageV1 } from
  '../apps/api/src/official-reader-private-paid-answer-reread-v1.js';

const input = () => ({
  pool: {} as PostgresSubjectPoolV1,
  verifiedEvidence: { kind: 'member' as const, verifiedAuthUserId: SUBJECT },
  threadId: THREAD,
  safeMessageId: MARKER,
  keyResolver: { resolveCachedKey: (ref: string) =>
    ref === KEY_REF ? { keyRef: KEY_REF } as never : null },
  privacyLedgerPort: {
    acquireReadLease: async () => ({
      contractVersion: 'official-reader-privacy-read-lease-v1' as const,
      subjectId: SUBJECT,
      selector: 'chat:' + THREAD + ':' + MARKER,
      ledgerCheckpoint: 'checkpoint',
      restoreEpoch: 'epoch',
      expiresAtEpochMs: Date.now() + 20_000,
    }),
    isLeaseCurrent: () => state.current,
  },
});

beforeEach(() => {
  state.current = true;
  state.revokeAtCommit = false;
  state.transactions = 0;
  state.leaseChecks = 0;
  state.privateSelects = 0;
  state.decrypts = 0;
});

describe('S4 privacy tombstone vs S6 SQL COMMIT and S7 HTTP release boundary', () => {
  it('returns the protected body only after the off-primary lease survives COMMIT', async () => {
    const answer = await readPrivateOfficialReaderPaidChatMessageV1(input());
    expect(answer.body).toBe(SECRET);
    expect(answer.delivery).toBeUndefined();
    expect(state.transactions).toBe(2);
    expect(state.privateSelects).toBe(1);
    expect(state.decrypts).toBe(1);
    expect(state.leaseChecks).toBe(5);
  });

  it('fails closed if Privacy revokes the lease after S1 SQL completes but before plaintext return', async () => {
    state.revokeAtCommit = true;
    await expect(readPrivateOfficialReaderPaidChatMessageV1(input()))
      .rejects.toMatchObject({ code: 'PAID_READER_READ_UNAVAILABLE' });
    expect(state.transactions).toBe(2);
    expect(state.privateSelects).toBe(1);
    expect(state.decrypts).toBe(1);
    expect(state.leaseChecks).toBe(5);
    expect(state.current).toBe(false);
  });
});
