import { describe, expect, it } from 'vitest';
import {
  getOfficialReadingRecord,
  type OfficialReadingRecordAuthorityRowV1,
  type OfficialReadingRecordV1,
} from './official-reading-record-read.js';
import {
  OFFICIAL_READER_ADMISSION_VERSION_V1,
  type PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import {
  inspectOfficialReaderS5S7ContinuityV1,
  inspectOfficialReaderS5S7WithCurrentRecordsV1,
  type S5CommittedReferenceV1,
  type S6PrivateReadReferenceV1,
  type S7AcknowledgedReferenceV1,
} from './official-reader-s5-s7-reading-continuity-v1.js';

const SUBJECT = '66666666-6666-4666-8666-666666666666';
const READING = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const THREAD = '77777777-7777-4777-8777-777777777777';
const BUNDLE = '88888888-8888-4888-8888-888888888888';
const RELEASE = '99999999-9999-4999-8999-999999999999';
const BODY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SAFE_MESSAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TURN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ATTEMPT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DELIVERY_REQUEST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DELIVERY_ATTEMPT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const COMPLETED_AT = '2026-10-21T07:00:00.000Z';
const COMMITTED_AT = '2026-10-22T01:00:00.000Z';
const PREPARED_AT = '2026-10-22T01:00:02.000Z';
const ACK_AT = '2026-10-22T01:00:03.000Z';
const CONTRACT = 'myeonghwa-product-reading-response-v2';

function response() {
  return {
    responseVersion: CONTRACT,
    responseId: 'reading_response_' + 'a'.repeat(24),
    state: 'delivered',
    reading: {
      readingId: READING,
      sections: [{
        sectionType: 'career',
        title: '직업운',
        state: 'complete',
        blocks: [{ type: 'paragraph', text: '확인된 구조적 사실만 제공합니다.' }],
      }],
      disclosures: [{ type: 'scope_limitation', text: '미래 성공을 단정하지 않습니다.' }],
    },
  };
}
function admission(): PreparedOfficialReadingReaderAdmissionV1 {
  return {
    source: {
      subjectId: SUBJECT,
      readingId: READING,
      readingSessionId: SESSION,
      productId: 'prod-saju',
      readerCharacterId: 'seyeon',
      readerContentBundleId: BUNDLE,
      topicKey: 'career',
      sajuDomain: 'career',
      readingPeriod: 'natal',
      readingVariant: 'standard',
      sourceBirthRevisionId: 'birth-v1',
      productSpecVersion: 'spec-v1',
      domainCapabilityVersion: 'domain-v1',
      readingContractVersion: CONTRACT,
      sajuEngineVersion: 'saju-v1',
      responseHash: 'sha256:authorized-response',
      productResponseState: 'delivered',
      responseSnapshotJsonb: response(),
      completedAt: COMPLETED_AT,
    },
    scope: {
      subjectId: SUBJECT,
      threadId: THREAD,
      contentRevision: 1,
      readingId: READING,
      readerCharacterId: 'seyeon',
      readerContentBundleId: BUNDLE,
      contentReleaseId: RELEASE,
      effectiveAt: '2026-10-22T00:55:00.000Z',
      productId: 'prod-saju',
      productSpecVersion: 'spec-v1',
      sajuDomain: 'career',
      readingContractVersion: CONTRACT,
      officialArtifactResponseHash: 'sha256:authorized-response',
      productRuleVersion: 'rule-v1',
      approvedPolicyRevision: 'approval-v1',
    },
    ticket: { kind: OFFICIAL_READER_ADMISSION_VERSION_V1 },
  };
}
async function record(
  overrides: Partial<OfficialReadingRecordAuthorityRowV1> = {},
): Promise<OfficialReadingRecordV1> {
  return getOfficialReadingRecord({
    resolvedSubjectId: SUBJECT,
    readingId: READING,
    authorityPort: {
      readRecord: async () => ({
        readingId: READING,
        readingSessionId: SESSION,
        sajuDomain: 'career',
        readingContractVersion: CONTRACT,
        productResponseState: 'delivered',
        responseSnapshotJsonb: response(),
        responseHash: 'sha256:authorized-response',
        readerCharacterIds: ['seyeon'],
        completedAt: COMPLETED_AT,
        ...overrides,
      }),
    },
  });
}
function committed(): S5CommittedReferenceV1 {
  return {
    contractVersion: 'official-reader-s5-protected-answer-commit-v1',
    bodyId: BODY,
    safeMessageId: SAFE_MESSAGE,
    turnId: TURN,
    attemptId: ATTEMPT,
    committedAt: COMMITTED_AT,
    replayed: false,
  };
}
function reread(): S6PrivateReadReferenceV1 {
  return {
    bodyId: BODY,
    officialReadingId: READING,
    readerCharacterId: 'seyeon',
    committedAt: COMMITTED_AT,
    delivery: {
      contractVersion: 'official-reader-s7-private-delivery-v1',
      deliveryRequestId: DELIVERY_REQUEST,
      deliveryAttemptId: DELIVERY_ATTEMPT,
      responsePreparedAt: PREPARED_AT,
      replayed: false,
    },
  };
}
function acknowledged(): S7AcknowledgedReferenceV1 {
  return {
    contractVersion: 'official-reader-s7-private-delivery-v1',
    deliveryAttemptId: DELIVERY_ATTEMPT,
    clientAcknowledgedAt: ACK_AT,
    replayed: false,
  };
}
async function input() {
  return {
    readerAdmission: admission(),
    record: await record(),
    s5Commit: committed(),
    s6Read: reread(),
  };
}

describe('Official S5→S6→S7 exact Reading continuity, never approval', () => {
  it('distinguishes protected S5 commit, S7 preparation and authenticated ACK as separate evidence', async () => {
    const data = await input();
    const first = inspectOfficialReaderS5S7ContinuityV1({
      ...data,
      s6Read: {
        bodyId: BODY,
        officialReadingId: READING,
        readerCharacterId: 'seyeon',
        committedAt: COMMITTED_AT,
      },
    });
    expect(first).toMatchObject({
      state: 'held', evidenceStage: 'S5_COMMITTED_REFERENCE',
      canDisclose: false, canPersist: false,
    });
    const prepared = inspectOfficialReaderS5S7ContinuityV1(data);
    expect(prepared).toMatchObject({
      state: 'held', evidenceStage: 'S7_RESPONSE_PREPARED',
      sourceAuthority: 'NOT_EVALUATED',
      privacyApproval: 'NOT_EVALUATED',
      s5AtomicStorage: 'DB_OWNER_REQUIRED',
      s7Delivery: 'DB_OWNER_REQUIRED',
      canPublish: false, canSell: false,
    });
    const ack = inspectOfficialReaderS5S7ContinuityV1({
      ...data,
      s7Acknowledged: acknowledged(),
    });
    expect(ack).toMatchObject({
      state: 'held', evidenceStage: 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ',
      canDisclose: false, currentAccessAuthority: 'NOT_EVALUATED',
    });
    expect(Object.isFrozen(ack)).toBe(true);
    for (const result of [first, prepared, ack]) {
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(BODY);
      expect(serialized).not.toContain(READING);
      expect(serialized).not.toContain('확인된');
      expect(serialized).not.toContain(DELIVERY_REQUEST);
    }
  });

  it('requires one DB-admitted Reading and identical latest Reader/Records snapshots', async () => {
    const data = await input();
    const different: typeof data[] = [
      { ...data, readerAdmission: {
        ...data.readerAdmission,
        scope: { ...data.readerAdmission.scope, readingId: 'other-reading' },
      } },
      { ...data, readerAdmission: {
        ...data.readerAdmission,
        source: { ...data.readerAdmission.source, readerCharacterId: 'baekheon' },
      } },
      { ...data, readerAdmission: {
        ...data.readerAdmission,
        scope: { ...data.readerAdmission.scope, readerContentBundleId: 'other-bundle' },
      } },
      { ...data, record: { ...data.record, readingSessionId: 'another-session' } },
      { ...data, record: { ...data.record, productResponseState: 'delivered_with_fallback' } },
      { ...data, record: { ...data.record, readerCharacterIds: ['another-reader'] } },
      { ...data, record: { ...data.record, completedAt: '2026-10-20T07:00:00.000Z' } },
      { ...data, record: { ...data.record, reading: {
        ...data.record.reading,
        reading: {
          ...(data.record.reading.reading as Record<string, unknown>),
          sections: [{ sectionType: 'career', title: '직업운', state: 'complete',
            blocks: [{ type: 'paragraph', text: '위조된 성공 예측' }] }],
        },
      } } },
    ];
    for (const item of different) {
      expect(inspectOfficialReaderS5S7ContinuityV1(item)).toMatchObject({
        state: 'blocked', evidenceStage: 'UNAVAILABLE', canDisclose: false,
      });
    }
  });

  it('blocks altered or missing S5 body references, S6 reread references and invalid timestamps', async () => {
    const data = await input();
    for (const item of [
      { ...data, s5Commit: { ...data.s5Commit, bodyId: 'another-body' } },
      { ...data, s5Commit: { ...data.s5Commit, safeMessageId: 'invalid' } },
      { ...data, s5Commit: { ...data.s5Commit, committedAt: 'later-than-reread' } },
      { ...data, s6Read: { ...data.s6Read, bodyId: 'another-body' } },
      { ...data, s6Read: { ...data.s6Read, officialReadingId: 'another-reading' } },
      { ...data, s6Read: { ...data.s6Read, readerCharacterId: 'other-reader' } },
      { ...data, s6Read: { ...data.s6Read, committedAt: '2026-10-22T01:05:00Z' } },
      { ...data, s6Read: { ...data.s6Read,
        delivery: { ...data.s6Read.delivery!, responsePreparedAt: '2026-10-22T00:59:00Z' },
      } },
    ]) {
      expect(inspectOfficialReaderS5S7ContinuityV1(item)).toMatchObject({
        state: 'blocked', canDisclose: false, canPersist: false,
      });
    }
  });

  it('does not treat an unrelated S7 ACK or ACK before preparation as client receipt evidence', async () => {
    const data = await input();
    for (const ack of [
      { ...acknowledged(), deliveryAttemptId: 'other-attempt' },
      { ...acknowledged(), clientAcknowledgedAt: '2026-10-22T00:00:00Z' },
      { ...acknowledged(), clientAcknowledgedAt: 'garbled' },
    ]) {
      expect(inspectOfficialReaderS5S7ContinuityV1({
        ...data, s7Acknowledged: ack,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
    expect(inspectOfficialReaderS5S7ContinuityV1({
      ...data,
      s6Read: {
        bodyId: BODY,
        officialReadingId: READING,
        readerCharacterId: 'seyeon',
        committedAt: COMMITTED_AT,
      },
      s7Acknowledged: acknowledged(),
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });

  it('enforces commit not earlier than the admitted Reading and current Reader scope', async () => {
    const data = await input();
    expect(inspectOfficialReaderS5S7ContinuityV1({
      ...data,
      s5Commit: {
        ...data.s5Commit,
        committedAt: '2026-10-20T01:00:00.000Z',
      },
      s6Read: {
        ...data.s6Read,
        committedAt: '2026-10-20T01:00:00.000Z',
      },
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });

  it('uses existing Records subject-authorized lookup and blocks missing/revoked archive before continuity', async () => {
    const data = await input();
    const calls: string[] = [];
    const port = {
      readRecord: async ({ subjectId, readingId }: { subjectId: string; readingId: string }) => {
        calls.push(subjectId + '/' + readingId);
        const row: OfficialReadingRecordAuthorityRowV1 = {
          readingId: READING,
          readingSessionId: SESSION,
          sajuDomain: 'career',
          readingContractVersion: CONTRACT,
          productResponseState: 'delivered',
          responseSnapshotJsonb: response(),
          responseHash: 'sha256:authorized-response',
          readerCharacterIds: ['seyeon'],
          completedAt: COMPLETED_AT,
        };
        return row;
      },
    };
    const verified = await inspectOfficialReaderS5S7WithCurrentRecordsV1({
      readerAdmission: data.readerAdmission,
      recordAuthorityPort: port,
      s5Commit: data.s5Commit,
      s6Read: data.s6Read,
      s7Acknowledged: acknowledged(),
    });
    expect(verified).toMatchObject({
      state: 'held',
      evidenceStage: 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ',
      canDisclose: false, canPersist: false,
    });
    expect(calls).toEqual([SUBJECT + '/' + READING]);

    const revoked = await inspectOfficialReaderS5S7WithCurrentRecordsV1({
      readerAdmission: data.readerAdmission,
      recordAuthorityPort: { readRecord: async () => null },
      s5Commit: data.s5Commit,
      s6Read: data.s6Read,
      s7Acknowledged: acknowledged(),
    });
    expect(revoked).toMatchObject({ state: 'blocked', canDisclose: false });

    let invoked = false;
    const crossed = await inspectOfficialReaderS5S7WithCurrentRecordsV1({
      readerAdmission: {
        ...data.readerAdmission,
        scope: { ...data.readerAdmission.scope, subjectId: 'another-subject' },
      },
      recordAuthorityPort: {
        readRecord: async () => {
          invoked = true;
          throw new Error('incorrect cross-subject read');
        },
      },
      s5Commit: data.s5Commit,
      s6Read: data.s6Read,
    });
    expect(invoked).toBe(false);
    expect(crossed).toMatchObject({ state: 'blocked', canDisclose: false });
  });

  it('accepts replayed immutable metadata but never turns replay into another delivery authorization', async () => {
    const data = await input();
    const result = inspectOfficialReaderS5S7ContinuityV1({
      ...data,
      s5Commit: { ...data.s5Commit, replayed: true },
      s6Read: {
        ...data.s6Read,
        delivery: { ...data.s6Read.delivery!, replayed: true },
      },
      s7Acknowledged: { ...acknowledged(), replayed: true },
    });
    expect(result).toMatchObject({
      state: 'held',
      evidenceStage: 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ',
      canPersist: false, canDisclose: false,
      s7Delivery: 'DB_OWNER_REQUIRED',
    });
  });
});
