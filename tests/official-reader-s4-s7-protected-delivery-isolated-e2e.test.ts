import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  encryptOfficialReaderProtectedBodyV1,
  OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1,
  type OfficialReaderProtectedBodyIdentityV1,
} from '../apps/api/src/official-reader-protected-body-crypto-v1.js';
import { handleOfficialReaderPaidChatMessageHttpV1 } from
  '../apps/api/src/official-reader-paid-chat-message-http-v1.js';
import { handleOfficialReaderPaidDeliveryAckHttpV1 } from
  '../apps/api/src/official-reader-paid-chat-delivery-ack-http-v1.js';
import type { PostgresSubjectPoolV1 } from
  '../apps/api/src/postgres-subject-execution.js';

/**
 * S4 + S7 ISOLATED endpoint integration.
 * Real owner-scoped transaction wrapper, S6 selector, AES-GCM, Privacy lease,
 * S7 HMAC and both HTTP handlers; ONLY the SQL backend is an in-memory double.
 * No real Saju Production issuer, S5 COMMIT, live payment, ACL or public route.
 * This is NOT the final Production S8 E2E acceptance.
 */
const SUBJECT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THREAD = '33333333-3333-4333-8333-333333333333';
const MARKER = '44444444-4444-4444-8444-444444444444';
const BODY = '55555555-5555-4555-8555-555555555555';
const READING = '66666666-6666-4666-8666-666666666666';
const BASE_URL = 'https://reader-isolated.example.test/api/chat/' + THREAD +
  '/paid-readings/' + MARKER;
const PRIVATE_TEXT = 'ISOLATED_PAID_ANSWER_MUST_NOT_ENTER_GENERAL_CHAT';
const COMMITTED_AT = '2026-10-26T00:00:00.000Z';
const ACK_AT = '2026-10-26T00:01:00.000Z';
const REQUEST_ID = '77777777-7777-4777-8777-777777777777';
const NEXT_REQUEST = '88888888-8888-4888-8888-888888888888';
const DELIVERY_ID = '99999999-9999-4999-8999-999999999999';
const KEY_REF = 'reader-dek-v1:' + BODY;
const TOKEN_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const BODY_KEY = { keyRef: KEY_REF, keyBytes: Uint8Array.from({ length: 32 }, (_, i) => i + 30) };

const identity: OfficialReaderProtectedBodyIdentityV1 = Object.freeze({
  subjectId: SUBJECT,
  threadId: THREAD,
  turnId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  safeMessageId: MARKER,
  officialReadingId: READING,
  readerCharacterId: 'seyeon',
  readerContentBundleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  contentReleaseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  originatingEntitlementGrantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  productId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  sourceResponseHash: 'sha256:v1:' + 'a'.repeat(64),
});

function isolatedReaderHarness() {
  const encrypted = encryptOfficialReaderProtectedBodyV1({
    identity, body: PRIVATE_TEXT, key: BODY_KEY,
  });
  const pending = new Map<string, {
    tokenHash: string; ackAt: string | null;
  }>();
  const statementLog: string[] = [];
  let active = true;
  let privacyCurrent = true;
  let sourceCurrent = true;
  let successfulCiphertextReads = 0;
  let commits = 0;
  let revokePrivacyAfterSecondCommit = false;

  const pool = {
    async connect() {
      return {
        release() {},
        async query(sql: string, args: readonly unknown[] = []) {
          statementLog.push(sql);
          if (sql === 'BEGIN' || sql === 'SET LOCAL ROLE myeongha_api_executor'
            || sql === 'ROLLBACK') return { rows: [] };
          if (sql === 'COMMIT') {
            commits++;
            // Restore/revoke can win AFTER the S6 SQL transaction has committed.
            if (revokePrivacyAfterSecondCommit && commits === 2) {
              privacyCurrent = false;
            }
            return { rows: [] };
          }
          if (sql.includes('begin_member_subject_context_v1')) {
            return { rows: [{ subjectId: args[0], subjectKind: 'member' }] };
          }
          if (sql.includes('assert_myeongha_subject_context_v1')
              && !sql.includes('internal_assert_official_reader_current')) {
            return { rows: [{}] };
          }
          if (sql.includes('internal_qry_official_reader_paid_chat_marker_ciphertext_v1')) {
            if (active && sourceCurrent && args[0] === SUBJECT
                && args[1] === THREAD && args[2] === MARKER) {
              successfulCiphertextReads++;
              return { rows: [{
                bodyId: BODY,
                threadId: THREAD,
                turnId: identity.turnId,
                attemptId: identity.attemptId,
                safeMessageId: MARKER,
                officialReadingId: READING,
                readerCharacterId: identity.readerCharacterId,
                readerContentBundleId: identity.readerContentBundleId,
                contentReleaseId: identity.contentReleaseId,
                originatingGrantId: identity.originatingEntitlementGrantId,
                productId: identity.productId,
                sourceResponseHash: identity.sourceResponseHash,
                encryptionSchemeVersion: OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1,
                encryptionKeyRef: encrypted.keyRef,
                encryptionIv: encrypted.iv,
                encryptionAuthTag: encrypted.authTag,
                encryptedBody: encrypted.ciphertext,
                committedAt: COMMITTED_AT,
              }] };
            }
            return { rows: [] };
          }
          if (sql.includes('internal_assert_official_reader_current_verified_purchase_bundle_v1')) {
            if (!active || args[0] !== SUBJECT || args[1] !== READING
                || args[2] !== 'seyeon' || args[3] !== identity.readerContentBundleId) {
              throw new Error('simulated S1 original verified purchase revoked');
            }
            return { rows: [{ guardExecuted: null }] };
          }
          if (sql.includes('internal_prepare_official_reader_paid_delivery_v1')) {
            if (!active || args[0] !== SUBJECT || args[1] !== BODY
                || args[2] !== THREAD || args[3] !== MARKER) {
              throw new Error('simulated S7 prepare access denied');
            }
            const request = args[4] as string;
            const hash = args[5] as string;
            const existing = pending.get(request);
            if (existing && existing.tokenHash !== hash) throw new Error('replayed token mismatch');
            if (!existing) pending.set(request, { tokenHash: hash, ackAt: null });
            return { rows: [{
              deliveryAttemptId: DELIVERY_ID,
              responsePreparedAt: COMMITTED_AT,
              replayed: existing !== undefined,
            }] };
          }
          if (sql.includes('internal_ack_official_reader_paid_delivery_v1')) {
            if (args[0] !== SUBJECT || args[1] !== THREAD || args[2] !== MARKER
                || args[3] !== DELIVERY_ID) throw new Error('wrong Subject/marker');
            const entry = pending.get(args[4] as string);
            if (!entry || entry.tokenHash !== args[5]) throw new Error('invalid original ACK');
            if (entry.ackAt) return { rows: [{
              clientAcknowledgedAt: entry.ackAt, replayed: true,
            }] };
            entry.ackAt = ACK_AT;
            return { rows: [{ clientAcknowledgedAt: ACK_AT, replayed: false }] };
          }
          throw new Error('Unexpected SQL in isolated Reader E2E');
        },
      };
    },
  } as unknown as PostgresSubjectPoolV1;

  const verify = {
    verifyRequestIdentity: vi.fn(async (req: Request) => ({
      kind: 'member' as const,
      verifiedAuthUserId: req.headers.get('X-Test-Subject') ?? SUBJECT,
    })),
  };

  const privacyLedgerPort = {
    async acquireReadLease({ subjectId, selector }: { subjectId: string; selector: string }) {
      if (!privacyCurrent || !active) return null;
      return {
        contractVersion: 'official-reader-privacy-read-lease-v1' as const,
        subjectId, selector, ledgerCheckpoint: 'isolated-backup-independent-checkpoint',
        restoreEpoch: 'isolated-current-epoch',
        expiresAtEpochMs: Date.now() + 5_000,
      };
    },
    isLeaseCurrent: () => privacyCurrent && active,
  };

  function readRequest(requestId = REQUEST_ID, subject = SUBJECT, marker = MARKER) {
    return new Request(
      'https://reader-isolated.example.test/api/chat/' + THREAD + '/paid-readings/' + marker,
      { method: 'GET', headers: {
        'X-Test-Subject': subject,
        'X-Reader-Delivery-Request-Id': requestId,
      } },
    );
  }

  async function get(request = readRequest(), enabled = true) {
    return handleOfficialReaderPaidChatMessageHttpV1({
      request, requestId: 'isolated', serverTime: ACK_AT,
      paidReadReleaseEnabled: enabled,
      pool, identityEvidenceVerifier: verify as never,
      keyResolver: { resolveCachedKey: (ref: string) => ref === KEY_REF ? BODY_KEY : null },
      privacyLedgerPort,
      deliveryTokenSecret: TOKEN_KEY,
    });
  }

  async function ack(delivery: Record<string, string>, subject = SUBJECT, token = delivery.acknowledgementToken) {
    const request = new Request(BASE_URL + '/ack', {
      method: 'POST',
      headers: {
        Origin: 'https://reader-isolated.example.test',
        'Content-Type': 'application/json',
        'X-Reader-Delivery-Ack': '1',
        'X-Test-Subject': subject,
      },
      body: JSON.stringify({
        schemaVersion: 'official-reader-s7-private-delivery-v1',
        deliveryAttemptId: delivery.deliveryAttemptId,
        deliveryRequestId: delivery.deliveryRequestId,
        acknowledgementToken: token,
      }),
    });
    return handleOfficialReaderPaidDeliveryAckHttpV1({
      request, requestId: 'isolated', serverTime: ACK_AT,
      paidReadReleaseEnabled: true, pool, identityEvidenceVerifier: verify as never,
    });
  }

  return {
    get, ack, readRequest, statementLog, pending, verify,
    revokePurchase() { active = false; },
    tombstonePrivacy() { privacyCurrent = false; },
    revokePrivacyOnSecondCommit() { revokePrivacyAfterSecondCommit = true; },
    revokeSource() { sourceCurrent = false; },
    get reads() { return successfulCiphertextReads; },
    get committedTransactions() { return commits; },
    ciphertext: encrypted.ciphertext,
  };
}

describe('S4/S7 isolated protected Reader HTTP + current-purchase + Privacy + ACK E2E', () => {
  it('keeps the public route held even if an encrypted S4 answer exists', async () => {
    const h = isolatedReaderHarness();
    const response = await h.get(h.readRequest(), false);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(PRIVATE_TEXT);
    expect(h.reads).toBe(0);
    expect(h.committedTransactions).toBe(0);
  });

  it('re-reads an actual encrypted body, prepares once, ACKs once, and replays lost responses without marking legal delivery', async () => {
    const h = isolatedReaderHarness();
    expect(Buffer.from(h.ciphertext).toString('utf8')).not.toContain(PRIVATE_TEXT);

    // Owner-approved flag is injected here ONLY in this disposable test.
    const first = await h.get();
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toContain('no-store');
    const firstData = (await first.json()).data;
    expect(firstData.body).toBe(PRIVATE_TEXT);
    expect(firstData.delivery.replayed).toBe(false);
    expect(h.pending.size).toBe(1);
    expect(h.pending.get(REQUEST_ID)?.ackAt).toBeNull();

    // Network response loss: same request ID does not create new S7 evidence.
    const retry = await h.get();
    const retryData = (await retry.json()).data;
    expect(retryData.body).toBe(PRIVATE_TEXT);
    expect(retryData.delivery.replayed).toBe(true);
    expect(retryData.delivery.acknowledgementToken)
      .toBe(firstData.delivery.acknowledgementToken);
    expect(h.pending.size).toBe(1);

    const ack1 = await h.ack(firstData.delivery);
    expect(ack1.status).toBe(200);
    expect((await ack1.json()).data.replayed).toBe(false);
    expect(h.pending.get(REQUEST_ID)?.ackAt).toBe(ACK_AT);

    const ack2 = await h.ack(firstData.delivery);
    expect(ack2.status).toBe(200);
    expect((await ack2.json()).data.replayed).toBe(true);

    // Cross-member ACK cannot borrow the original subject's receipt/token.
    const crossMemberAck = await h.ack(firstData.delivery, OTHER);
    expect(crossMemberAck.status).toBe(404);
    expect(h.pending.get(REQUEST_ID)?.ackAt).toBe(ACK_AT);

    const originalToken: string = firstData.delivery.acknowledgementToken;
    const badAck = await h.ack(firstData.delivery, SUBJECT,
      originalToken.slice(0, -1) + (originalToken.endsWith('A') ? 'B' : 'A'));
    expect(badAck.status).toBe(404);
    expect(h.pending.size).toBe(1);
    expect(h.reads).toBe(2);
    expect(h.statementLog.some(sql =>
      sql.includes('internal_assert_official_reader_current_verified_purchase_bundle_v1')))
      .toBe(true);
    expect(h.statementLog.some(sql =>
      sql.includes('internal_qry_official_reader_paid_chat_marker_ciphertext_v1')))
      .toBe(true);
    // No private body in the SQL text or S7 receipt store.
    expect(JSON.stringify([...h.pending])).not.toContain(PRIVATE_TEXT);
    expect(h.statementLog.join(' ')).not.toContain(PRIVATE_TEXT);
    expect(createHash('sha256').update(PRIVATE_TEXT).digest('hex'))
      .not.toBe(h.pending.get(REQUEST_ID)?.tokenHash);
  });

  it('does not leak a decrypted answer or prepare delivery when Privacy revokes during the final SQL COMMIT', async () => {
    const h = isolatedReaderHarness();
    h.revokePrivacyOnSecondCommit();
    const response = await h.get();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(PRIVATE_TEXT);
    expect(h.committedTransactions).toBe(2);
    expect(h.reads).toBe(1);
    expect(h.pending.size).toBe(0);
  });

  it('blocks cross-member, cross-marker, revoked Receipt, source revocation and Privacy restore tombstone before new plaintext release', async () => {
    const h = isolatedReaderHarness();
    const other = await h.get(h.readRequest(REQUEST_ID, OTHER));
    expect(other.status).toBe(404);
    expect(await other.text()).not.toContain(PRIVATE_TEXT);

    const marker = await h.get(h.readRequest(REQUEST_ID, SUBJECT,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    expect(marker.status).toBe(404);
    expect(h.pending.size).toBe(0);

    // A valid right can read, then refund must prevent fresh S6 and S7 prepare.
    const live = await h.get();
    expect(live.status).toBe(200);
    const delivery = (await live.json()).data.delivery;
    h.revokePurchase();
    const refund = await h.get(h.readRequest(NEXT_REQUEST));
    expect(refund.status).toBe(404);
    expect(await refund.text()).not.toContain(PRIVATE_TEXT);
    expect(h.pending.size).toBe(1);

    // An already prepared ACK is historical only; it is not new entitlement.
    const prior = await h.ack(delivery);
    expect(prior.status).toBe(200);
    const replay = await h.ack(delivery);
    expect((await replay.json()).data.replayed).toBe(true);

    // Independent off-primary Privacy tombstone also denies once installed.
    const restored = isolatedReaderHarness();
    restored.tombstonePrivacy();
    const privacy = await restored.get();
    expect(privacy.status).toBe(404);
    expect(restored.reads).toBe(0);

    const source = isolatedReaderHarness();
    source.revokeSource();
    const missingSource = await source.get();
    expect(missingSource.status).toBe(404);
    expect(source.pending.size).toBe(0);
  });
});
