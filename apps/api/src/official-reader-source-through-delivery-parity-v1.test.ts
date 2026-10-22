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
  type S5CommittedReferenceV1,
  type S6PrivateReadReferenceV1,
  type S7AcknowledgedReferenceV1,
} from './official-reader-s5-s7-reading-continuity-v1.js';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import {
  inspectOfficialReaderSourceThroughDeliveryParityV1,
} from './official-reader-source-through-delivery-parity-v1.js';
import {
  inspectOfficialReaderS6CiphertextS7IdentityV1,
  type OfficialReaderS6CiphertextIdentityWitnessV1,
  type OfficialReaderS7PreparedBindingWitnessV1,
} from './official-reader-s6-ciphertext-s7-identity-v1.js';
import {
  inspectOfficialReaderS5S7ImmutableReplayV1,
} from './official-reader-s5-s7-immutable-replay-v1.js';

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
      calculationSummary: { ambiguity: [] },
    },
  };
}
function admission(): PreparedOfficialReadingReaderAdmissionV1 {
  return {
    source: {
      subjectId: SUBJECT,
      readingId: READING,
      readingSessionId: SESSION,
      productId: '12121212-1212-4121-8121-121212121212',
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
      productId: '12121212-1212-4121-8121-121212121212',
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


function handoff(reader: PreparedOfficialReadingReaderAdmissionV1) {
  const response = reader.source.responseSnapshotJsonb;
  const projected = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(reader.source);
  const source = {
    readingId: reader.source.readingId,
    responseId: (response as { responseId: string }).responseId,
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseBodyHash: hashSajuHeldSourceProofRequestV1(response),
    inventoryHash: '',
    snapshotId: 'snapshot-test',
    interpretationRunId: 'run-test',
    registrySnapshotId: 'registry-test',
    executionId: 'execution-test',
    preparationId: 'preparation-test',
    selectionId: 'selection-test',
    profileRef: { id: 'profile-test', version: '1.0.0', contentHash: 'a'.repeat(64) },
    evidenceBundleHash: 'b'.repeat(64),
    readingVersion: 'reading-v1',
  };
  const inventory = {
    segments: projected.protectedSegments.map(v => ({
      sourceRef: v.sourceRef, contentHash: hashProtectedSajuTextV1(v.text),
    })),
    disclosures: projected.disclosures.map(v => ({
      sourceRef: v.sourceRef, contentHash: hashProtectedSajuTextV1(v.text),
    })),
    ambiguityHashes: projected.ambiguity.map(hashProtectedSajuTextV1),
  };
  source.inventoryHash = hashSajuHeldSourceProofRequestV1({
    version: 'saju-reader-records-source-reference-handoff-v1',
    readingId: source.readingId,
    responseId: source.responseId,
    responseBodyHash: source.responseBodyHash,
    inventory,
  });
  return {
    version: 'saju-reader-records-source-reference-handoff-v1',
    state: 'held',
    lifecycle: 'preview',
    sourceAuthority: 'NOT_EVALUATED',
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    subjectBinding: 'DB_OWNER_REQUIRED',
    s5AtomicStorage: 'DB_OWNER_REQUIRED',
    s7Delivery: 'DB_OWNER_REQUIRED',
    canPersist: false,
    canDisclose: false,
    canPublish: false,
    canSell: false,
    mayIssueS3OfficialCoverageCandidate: false,
    source,
    inventory,
  };
}


function port(current: OfficialReadingRecordV1, calls: string[]) {
  return {
    readRecord: async ({ subjectId, readingId }: { subjectId: string; readingId: string }) => {
      calls.push(subjectId + '/' + readingId);
      return {
        readingId: current.readingId,
        readingSessionId: current.readingSessionId,
        sajuDomain: current.sajuDomain,
        readingContractVersion: current.readingContractVersion,
        productResponseState: current.productResponseState,
        responseSnapshotJsonb: current.reading,
        responseHash: 'sha256:authorized-response',
        readerCharacterIds: current.readerCharacterIds,
        completedAt: current.completedAt,
      };
    },
  };
}

describe('S3 signed-source inventory through S5, S6, S7 single-snapshot continuity', () => {
  it('reads the existing DB Records source ONCE for SourceUnit and paid-delivery trace', async () => {
    const baseline = await input();
    const calls: string[] = [];
    const result = await inspectOfficialReaderSourceThroughDeliveryParityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, calls),
      sajuHandoff: handoff(baseline.readerAdmission),
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
      s7Acknowledged: acknowledged(),
    });
    expect(result).toEqual({
      contractVersion: 'official-reader-source-through-delivery-parity-v1',
      state: 'held',
      evidenceStage: 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ',
      sourceAuthority: 'NOT_EVALUATED',
      productionInterpretationAuthority: 'NOT_EVALUATED',
      privacyApproval: 'NOT_EVALUATED',
      s5AtomicStorage: 'DB_OWNER_REQUIRED',
      s7Delivery: 'DB_OWNER_REQUIRED',
      currentAccessAuthority: 'NOT_EVALUATED',
      canPersist: false, canDisclose: false, canPublish: false, canSell: false,
    });
    expect(calls).toEqual([SUBJECT + '/' + READING]);
    expect(Object.isFrozen(result)).toBe(true);
    const json = JSON.stringify(result);
    expect(json).not.toContain(READING);
    expect(json).not.toContain(BODY);
    expect(json).not.toContain('확인된');
    expect(json).not.toContain('sha256:');
    expect(json).not.toContain(DELIVERY_REQUEST);
  });

  it('requires S3 source to be exact even if S5 and S7 receipt metadata is well-formed', async () => {
    const baseline = await input();
    const allowed = handoff(baseline.readerAdmission);
    const changes = [];
    const wrongSource = structuredClone(allowed);
    wrongSource.source.readingId = 'official_reading_' + 'a'.repeat(20);
    changes.push(wrongSource);
    const wrongResponse = structuredClone(allowed);
    wrongResponse.source.responseBodyHash = 'c'.repeat(64);
    changes.push(wrongResponse);
    const missingDisclosure = structuredClone(allowed);
    missingDisclosure.inventory.disclosures = [];
    changes.push(missingDisclosure);
    const replacedSegment = structuredClone(allowed);
    replacedSegment.inventory.segments[0]!.contentHash = 'sha256:v1:' + 'd'.repeat(64);
    changes.push(replacedSegment);
    const escalated = { ...allowed, sourceAuthority: 'PRODUCTION_APPROVED' };
    changes.push(escalated);

    for (const sajuHandoff of changes) {
      const verdict = await inspectOfficialReaderSourceThroughDeliveryParityV1({
        readerAdmission: baseline.readerAdmission,
        recordAuthorityPort: port(baseline.record, []),
        sajuHandoff,
        s5Commit: baseline.s5Commit,
        s6Read: baseline.s6Read,
        s7Acknowledged: acknowledged(),
      });
      expect(verdict).toMatchObject({
        state: 'blocked', evidenceStage: 'UNAVAILABLE', canDisclose: false,
      });
    }
  });

  it('rejects different protected body or unrelated ACK after perfectly matching source inventory', async () => {
    const baseline = await input();
    const safe = handoff(baseline.readerAdmission);
    const wrongs = [
      { commit: { ...baseline.s5Commit, bodyId: 'bad-body' }, ack: acknowledged() },
      { commit: baseline.s5Commit, ack: { ...acknowledged(), deliveryAttemptId: 'wrong-attempt' } },
      { commit: baseline.s5Commit, ack: { ...acknowledged(), clientAcknowledgedAt: '2026-10-21T01:00:00Z' } },
    ];
    for (const wrong of wrongs) {
      expect(await inspectOfficialReaderSourceThroughDeliveryParityV1({
        readerAdmission: baseline.readerAdmission,
        recordAuthorityPort: port(baseline.record, []),
        sajuHandoff: safe,
        s5Commit: wrong.commit,
        s6Read: baseline.s6Read,
        s7Acknowledged: wrong.ack,
      })).toMatchObject({ state: 'blocked', canPersist: false, canDisclose: false });
    }
    const prepared = await inspectOfficialReaderSourceThroughDeliveryParityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, []),
      sajuHandoff: safe,
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
    });
    expect(prepared).toMatchObject({
      state: 'held', evidenceStage: 'S7_RESPONSE_PREPARED', canDisclose: false,
    });
  });

  it('rejects missing or revoked Records read, cross-subject source and changed current DB response', async () => {
    const baseline = await input();
    const sourceHandoff = handoff(baseline.readerAdmission);
    expect(await inspectOfficialReaderSourceThroughDeliveryParityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: { readRecord: async () => null },
      sajuHandoff: sourceHandoff,
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
    })).toMatchObject({ state: 'blocked', canDisclose: false });

    let called = false;
    expect(await inspectOfficialReaderSourceThroughDeliveryParityV1({
      readerAdmission: {
        ...baseline.readerAdmission,
        scope: { ...baseline.readerAdmission.scope, subjectId: 'another-subject' },
      },
      recordAuthorityPort: { readRecord: async () => {
        called = true;
        return null;
      } },
      sajuHandoff: sourceHandoff,
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
    })).toMatchObject({ state: 'blocked', canDisclose: false });
    expect(called).toBe(false);

    const changed = {
      ...baseline.record,
      reading: { ...baseline.record.reading,
        reading: {
          ...(baseline.record.reading.reading as Record<string, unknown>),
          sections: [{
            sectionType: 'career', title: '직업운', state: 'complete',
            blocks: [{ type: 'paragraph', text: '조작된 본문' }],
          }],
        },
      },
    };
    expect(await inspectOfficialReaderSourceThroughDeliveryParityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(changed, []),
      sajuHandoff: sourceHandoff,
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });
});

function ciphertextIdentity(
  reader: PreparedOfficialReadingReaderAdmissionV1,
  commit: S5CommittedReferenceV1,
): OfficialReaderS6CiphertextIdentityWitnessV1 {
  return {
    subjectId: reader.scope.subjectId,
    threadId: reader.scope.threadId,
    turnId: commit.turnId,
    attemptId: commit.attemptId,
    safeMessageId: commit.safeMessageId,
    officialReadingId: reader.scope.readingId,
    readerCharacterId: reader.scope.readerCharacterId,
    readerContentBundleId: reader.scope.readerContentBundleId,
    contentReleaseId: reader.scope.contentReleaseId,
    originatingEntitlementGrantId: '10101010-1010-4010-8010-101010101010',
    productId: reader.scope.productId,
    sourceResponseHash: 'sha256:v1:' +
      hashSajuHeldSourceProofRequestV1(reader.source.responseSnapshotJsonb),
  };
}

function deliveryBinding(
  reader: PreparedOfficialReadingReaderAdmissionV1,
  commit: S5CommittedReferenceV1,
  privateRead: S6PrivateReadReferenceV1,
): OfficialReaderS7PreparedBindingWitnessV1 {
  const prepared = privateRead.delivery;
  if (!prepared) throw new Error('Missing private S7 preparation.');
  return {
    subjectId: reader.scope.subjectId,
    threadId: reader.scope.threadId,
    safeMessageId: commit.safeMessageId,
    bodyId: commit.bodyId,
    deliveryRequestId: prepared.deliveryRequestId,
    deliveryAttemptId: prepared.deliveryAttemptId,
    responsePreparedAt: prepared.responsePreparedAt,
  };
}

describe('S6 encrypted identity witness pins Saju source to S5 and S7 exact message', () => {
  it('checks the same source text and encrypted-body AAD with ONE existing Records lookup, without granting access', async () => {
    const baseline = await input();
    const calls: string[] = [];
    const result = await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, calls),
      sajuHandoff: handoff(baseline.readerAdmission),
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
      s6CiphertextIdentity: ciphertextIdentity(baseline.readerAdmission, baseline.s5Commit),
      s7PreparedBinding: deliveryBinding(
        baseline.readerAdmission, baseline.s5Commit, baseline.s6Read,
      ),
      s7Acknowledged: acknowledged(),
    });
    expect(result).toMatchObject({
      state: 'held',
      evidenceStage: 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ',
      sourceAuthority: 'NOT_EVALUATED',
      canPersist: false,
      canDisclose: false,
      canPublish: false,
      canSell: false,
    });
    expect(calls).toEqual([SUBJECT + '/' + READING]);
    const serialized = JSON.stringify(result);
    for (const value of [
      BODY, READING, SUBJECT, DELIVERY_REQUEST, 'sha256:v1:', '확인된 구조적',
    ]) expect(serialized).not.toContain(value);
  });

  it('rejects tampered S6 ciphertext source hash, S5 attempt, Reader scope and private message identity', async () => {
    const baseline = await input();
    const source = handoff(baseline.readerAdmission);
    const valid = ciphertextIdentity(baseline.readerAdmission, baseline.s5Commit);
    const validDelivery = deliveryBinding(
      baseline.readerAdmission, baseline.s5Commit, baseline.s6Read,
    );
    const variations: OfficialReaderS6CiphertextIdentityWitnessV1[] = [
      { ...valid, subjectId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, threadId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, turnId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, attemptId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, safeMessageId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, officialReadingId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, readerCharacterId: 'baekheon' },
      { ...valid, readerContentBundleId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, contentReleaseId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, productId: '23232323-2323-4232-8232-232323232323' },
      { ...valid, sourceResponseHash: 'sha256:v1:' + 'a'.repeat(64) },
      { ...valid, originatingEntitlementGrantId: 'revoked-grant' },
    ];
    for (const s6CiphertextIdentity of variations) {
      const calls: string[] = [];
      const verdict = await inspectOfficialReaderS6CiphertextS7IdentityV1({
        readerAdmission: baseline.readerAdmission,
        recordAuthorityPort: port(baseline.record, calls),
        sajuHandoff: source,
        s5Commit: baseline.s5Commit,
        s6Read: baseline.s6Read,
        s6CiphertextIdentity,
        s7PreparedBinding: validDelivery,
      });
      expect(verdict).toMatchObject({ state: 'blocked', canDisclose: false });
      expect(calls).toHaveLength(0);
    }
  });

  it('requires the precise S7 Subject × thread × safe message × body × request × attempt tuple', async () => {
    const baseline = await input();
    const identity = ciphertextIdentity(baseline.readerAdmission, baseline.s5Commit);
    const prepared = deliveryBinding(
      baseline.readerAdmission, baseline.s5Commit, baseline.s6Read,
    );
    const wrongs: OfficialReaderS7PreparedBindingWitnessV1[] = [
      { ...prepared, subjectId: '23232323-2323-4232-8232-232323232323' },
      { ...prepared, threadId: '23232323-2323-4232-8232-232323232323' },
      { ...prepared, safeMessageId: '23232323-2323-4232-8232-232323232323' },
      { ...prepared, bodyId: '23232323-2323-4232-8232-232323232323' },
      { ...prepared, deliveryRequestId: '23232323-2323-4232-8232-232323232323' },
      { ...prepared, deliveryAttemptId: '23232323-2323-4232-8232-232323232323' },
      { ...prepared, responsePreparedAt: '2026-10-22T01:05:00.000Z' },
    ];
    for (const s7PreparedBinding of wrongs) {
      expect(await inspectOfficialReaderS6CiphertextS7IdentityV1({
        readerAdmission: baseline.readerAdmission,
        recordAuthorityPort: port(baseline.record, []),
        sajuHandoff: handoff(baseline.readerAdmission),
        s5Commit: baseline.s5Commit,
        s6Read: baseline.s6Read,
        s6CiphertextIdentity: identity,
        s7PreparedBinding,
        s7Acknowledged: acknowledged(),
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
    expect(await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, []),
      sajuHandoff: handoff(baseline.readerAdmission),
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
      s6CiphertextIdentity: identity,
      s7Acknowledged: acknowledged(),
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });

  it('accepts an S5-only continuity stage without inventing a prepared delivery or ACK', async () => {
    const baseline = await input();
    const privateRead: S6PrivateReadReferenceV1 = {
      bodyId: baseline.s6Read.bodyId,
      officialReadingId: baseline.s6Read.officialReadingId,
      readerCharacterId: baseline.s6Read.readerCharacterId,
      committedAt: baseline.s6Read.committedAt,
    };
    const source = handoff(baseline.readerAdmission);
    const ciphertext = ciphertextIdentity(baseline.readerAdmission, baseline.s5Commit);
    expect(await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, []),
      sajuHandoff: source,
      s5Commit: baseline.s5Commit,
      s6Read: privateRead,
      s6CiphertextIdentity: ciphertext,
    })).toMatchObject({
      state: 'held',
      evidenceStage: 'S5_COMMITTED_REFERENCE',
      canDisclose: false,
    });
    expect(await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, []),
      sajuHandoff: source,
      s5Commit: baseline.s5Commit,
      s6Read: privateRead,
      s6CiphertextIdentity: ciphertext,
      s7PreparedBinding: deliveryBinding(
        baseline.readerAdmission, baseline.s5Commit, baseline.s6Read,
      ),
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });

  it('does not resurrect a revoked Records archive or elevate a Preview Source to Official', async () => {
    const baseline = await input();
    const identity = ciphertextIdentity(baseline.readerAdmission, baseline.s5Commit);
    const delivery = deliveryBinding(
      baseline.readerAdmission, baseline.s5Commit, baseline.s6Read,
    );
    const source = handoff(baseline.readerAdmission);
    const revoked = await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: { readRecord: async () => null },
      sajuHandoff: source,
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
      s6CiphertextIdentity: identity,
      s7PreparedBinding: delivery,
    });
    expect(revoked).toMatchObject({ state: 'blocked', canDisclose: false });
    const forged = await inspectOfficialReaderS6CiphertextS7IdentityV1({
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, []),
      sajuHandoff: { ...source, sourceAuthority: 'PRODUCTION_VERIFIED' },
      s5Commit: baseline.s5Commit,
      s6Read: baseline.s6Read,
      s6CiphertextIdentity: identity,
      s7PreparedBinding: delivery,
    });
    expect(forged).toMatchObject({ state: 'blocked', canPersist: false });
  });
});

describe('S5 and S7 immutable replay of the same protected Official Reading', () => {
  async function replayCase() {
    const baseline = await input();
    const originalS5Commit = baseline.s5Commit;
    const originalS6Read = baseline.s6Read;
    return {
      readerAdmission: baseline.readerAdmission,
      recordAuthorityPort: port(baseline.record, []),
      sajuHandoff: handoff(baseline.readerAdmission),
      s6CiphertextIdentity: ciphertextIdentity(
        baseline.readerAdmission, originalS5Commit,
      ),
      originalS5Commit,
      replayS5Commit: { ...originalS5Commit, replayed: true },
      originalS6Read,
      replayS6Read: {
        ...originalS6Read,
        delivery: { ...originalS6Read.delivery!, replayed: true },
      },
      originalS7Binding: deliveryBinding(
        baseline.readerAdmission, originalS5Commit, originalS6Read,
      ),
      replayS7Binding: deliveryBinding(
        baseline.readerAdmission, originalS5Commit, originalS6Read,
      ),
    };
  }

  it('recognizes a single immutable protected body, prepared delivery and client ACK replays without authorizing reuse', async () => {
    const input = await replayCase();
    const calls: string[] = [];
    const result = await inspectOfficialReaderS5S7ImmutableReplayV1({
      ...input,
      recordAuthorityPort: port(await record(), calls),
      originalS7Acknowledged: acknowledged(),
      replayS7Acknowledged: { ...acknowledged(), replayed: true },
    });
    expect(result).toMatchObject({
      state: 'held',
      evidenceStage: 'S7_CLIENT_ACKNOWLEDGED_NOT_HUMAN_READ',
      sourceAuthority: 'NOT_EVALUATED',
      canPersist: false, canDisclose: false,
      canPublish: false, canSell: false,
    });
    expect(calls).toEqual([SUBJECT + '/' + READING]);
    expect(Object.isFrozen(result)).toBe(true);
    const json = JSON.stringify(result);
    for (const privateValue of [
      SUBJECT, READING, BODY, DELIVERY_ATTEMPT, 'sha256:v1:', '확인된 구조적',
    ]) expect(json).not.toContain(privateValue);

    const pendingAck = await inspectOfficialReaderS5S7ImmutableReplayV1(input);
    expect(pendingAck).toMatchObject({
      state: 'held', evidenceStage: 'S7_RESPONSE_PREPARED',
      canDisclose: false,
    });
  });

  it('refuses altered S5 replay identity and mismatched immutable original commit timestamps', async () => {
    const baseline = await replayCase();
    const altered = [
      { ...baseline.replayS5Commit, replayed: false },
      { ...baseline.replayS5Commit, bodyId: '23232323-2323-4232-8232-232323232323' },
      { ...baseline.replayS5Commit, safeMessageId: '23232323-2323-4232-8232-232323232323' },
      { ...baseline.replayS5Commit, turnId: '23232323-2323-4232-8232-232323232323' },
      { ...baseline.replayS5Commit, attemptId: '23232323-2323-4232-8232-232323232323' },
      { ...baseline.replayS5Commit, committedAt: '2026-10-22T01:09:00Z' },
    ];
    for (const replayS5Commit of altered) {
      const calls: string[] = [];
      expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
        ...baseline,
        recordAuthorityPort: port(await record(), calls),
        replayS5Commit,
      })).toMatchObject({ state: 'blocked', canPersist: false, canDisclose: false });
      expect(calls).toHaveLength(0);
    }
  });

  it('blocks a second delivery request, attempt, timestamp or a body/Reader swap even if the ACK appears correct', async () => {
    const baseline = await replayCase();
    const original = baseline.replayS6Read;
    const prepared = original.delivery!;
    const altered = [
      { ...original, bodyId: '23232323-2323-4232-8232-232323232323' },
      { ...original, officialReadingId: '23232323-2323-4232-8232-232323232323' },
      { ...original, readerCharacterId: 'baekheon' },
      { ...original, committedAt: '2026-10-22T01:05:00.000Z' },
      { ...original, delivery: { ...prepared, replayed: false } },
      { ...original, delivery: { ...prepared, deliveryRequestId: '23232323-2323-4232-8232-232323232323' } },
      { ...original, delivery: { ...prepared, deliveryAttemptId: '23232323-2323-4232-8232-232323232323' } },
      { ...original, delivery: { ...prepared, responsePreparedAt: '2026-10-22T01:05:00.000Z' } },
    ];
    for (const replayS6Read of altered) {
      expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
        ...baseline,
        replayS6Read,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
    const bindingDrift = {
      ...baseline.replayS7Binding,
      deliveryRequestId: '23232323-2323-4232-8232-232323232323',
    };
    expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
      ...baseline, replayS7Binding: bindingDrift,
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });

  it('does not equate a new ACK event with a replayed ACK and refuses changed replay acknowledgement', async () => {
    const baseline = await replayCase();
    const originalAck = acknowledged();
    const cases = [
      { originalS7Acknowledged: originalAck },
      { replayS7Acknowledged: { ...originalAck, replayed: true } },
      { originalS7Acknowledged: originalAck, replayS7Acknowledged: {
        ...originalAck, replayed: false,
      } },
      { originalS7Acknowledged: originalAck, replayS7Acknowledged: {
        ...originalAck, replayed: true, deliveryAttemptId: '23232323-2323-4232-8232-232323232323',
      } },
      { originalS7Acknowledged: originalAck, replayS7Acknowledged: {
        ...originalAck, replayed: true, clientAcknowledgedAt: '2026-10-22T01:09:00Z',
      } },
    ];
    for (const ack of cases) {
      expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
        ...baseline, ...ack,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
  });

  it('fails closed after Records access revocation, forged S3 source or accidental inclusion of private body', async () => {
    const baseline = await replayCase();
    expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
      ...baseline,
      recordAuthorityPort: { readRecord: async () => null },
    })).toMatchObject({ state: 'blocked', canDisclose: false });
    expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
      ...baseline,
      sajuHandoff: { ...baseline.sajuHandoff, sourceAuthority: 'PRODUCTION_APPROVED' },
    })).toMatchObject({ state: 'blocked', canDisclose: false });
    const privateBodyLeak = {
      ...baseline.replayS6Read,
      body: 'protected body must not cross the boundary',
    };
    expect(await inspectOfficialReaderS5S7ImmutableReplayV1({
      ...baseline,
      replayS6Read: privateBodyLeak,
    })).toMatchObject({ state: 'blocked', canDisclose: false });
  });
});
