import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  getOfficialReadingRecord,
  type OfficialReadingRecordAuthorityRowV1,
  type OfficialReadingRecordV1,
} from './official-reading-record-read.js';
import {
  OFFICIAL_READER_ADMISSION_VERSION_V1,
  type PreparedOfficialReadingReaderAdmissionV1,
} from './official-reading-reader-admission-v1.js';
import { projectOfficialStandardReadingToProtectedCharacterSajuContextV1 } from './character-standard-reading-protected-context.js';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import {
  hashSajuHeldSourceProofRequestV1,
  type SajuHeldSourceProofVerifierTrustV1,
} from './saju-held-source-proof-verifier-v1.js';
import {
  inspectSignedSajuDbReadingIdOnlyHandoffV1,
} from './saju-signed-db-reading-id-only-handoff-v1.js';

const SUBJECT = '66666666-6666-4666-8666-666666666666';
const READING = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const THREAD = '77777777-7777-4777-8777-777777777777';
const BUNDLE = '88888888-8888-4888-8888-888888888888';
const RELEASE = '99999999-9999-4999-8999-999999999999';
const NOW = '2026-10-22T04:00:00.000Z';

function response() {
  return {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    responseId: 'reading_response_' + 'a'.repeat(24),
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: READING,
      sections: [{
        sectionType: 'career',
        title: '직업운',
        state: 'complete',
        blocks: [{ type: 'paragraph', text: '확인된 구조적 맥락만 설명합니다.' }],
      }],
      disclosures: [{ type: 'scope_limitation', text: '미래 사건은 확정할 수 없습니다.' }],
      brand: { brandId: 'myeonghwa', displayName: '명화' },
      subject: {
        birthInputDisplay: {
          calendarType: 'solar', date: '2024-03-10',
          timeKnown: true, time: '12:00',
        },
        calculationState: 'resolved',
      },
      calculationSummary: {
        pillars: {
          year: { label: '연주', status: 'resolved', value: '갑진' },
          month: { label: '월주', status: 'resolved', value: '정묘' },
          day: { label: '일주', status: 'resolved', value: '경진' },
          hour: { label: '시주', status: 'resolved', value: '임오' },
        },
        ambiguity: [] as { title: string; summary: string }[],
      },
      generatedAt: '2026-10-22T08:00:00.000Z',
    },
  };
}

function admission(): PreparedOfficialReadingReaderAdmissionV1 {
  const snapshot = response();
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
      sourceBirthRevisionId: 'birth-revision-test',
      productSpecVersion: 'spec-1',
      domainCapabilityVersion: 'domain-1',
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      sajuEngineVersion: 'saju-test-v1',
      responseHash: 'sha256:stored-original',
      productResponseState: 'delivered',
      responseSnapshotJsonb: snapshot,
      completedAt: NOW,
    },
    scope: {
      subjectId: SUBJECT,
      threadId: THREAD,
      contentRevision: 1,
      readingId: READING,
      readerCharacterId: 'seyeon',
      readerContentBundleId: BUNDLE,
      contentReleaseId: RELEASE,
      effectiveAt: NOW,
      productId: 'prod-saju',
      productSpecVersion: 'spec-1',
      sajuDomain: 'career',
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      officialArtifactResponseHash: 'sha256:stored-original',
      productRuleVersion: 'policy-1',
      approvedPolicyRevision: 'policy-rev-1',
    },
    ticket: { kind: OFFICIAL_READER_ADMISSION_VERSION_V1 },
  };
}

async function record(
  override: Partial<OfficialReadingRecordAuthorityRowV1> = {},
): Promise<OfficialReadingRecordV1> {
  const row: OfficialReadingRecordAuthorityRowV1 = {
    readingId: READING,
    readingSessionId: SESSION,
    sajuDomain: 'career',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    productResponseState: 'delivered',
    responseSnapshotJsonb: response(),
    responseHash: 'sha256:stored-original',
    readerCharacterIds: ['seyeon'],
    completedAt: NOW,
    ...override,
  };
  return getOfficialReadingRecord({
    resolvedSubjectId: SUBJECT,
    readingId: READING,
    authorityPort: {
      readRecord: async ({ subjectId, readingId }) => {
        expect(subjectId).toBe(SUBJECT);
        expect(readingId).toBe(READING);
        return row;
      },
    },
  });
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



const NATIVE_READING = 'official_reading_' + 'c'.repeat(24);

function nativeHandoff(reader: PreparedOfficialReadingReaderAdmissionV1) {
  const copy = structuredClone(handoff(reader));
  copy.source.readingId = NATIVE_READING;
  copy.source.responseBodyHash = 'f'.repeat(64); // native source body differs by Reading ID
  rehash(copy);
  return copy;
}
function rehash(received: ReturnType<typeof handoff>) {
  received.source.inventoryHash = hashSajuHeldSourceProofRequestV1({
    version: received.version,
    readingId: received.source.readingId,
    responseId: received.source.responseId,
    responseBodyHash: received.source.responseBodyHash,
    inventory: received.inventory,
  });
}

function originalSajuResponse(
  reader: PreparedOfficialReadingReaderAdmissionV1,
): ReturnType<typeof response> {
  const native = structuredClone(reader.source.responseSnapshotJsonb) as ReturnType<typeof response>;
  native.reading.readingId = NATIVE_READING;
  return native;
}

function mappingWithExactOriginal(
  reader: PreparedOfficialReadingReaderAdmissionV1,
): { source: ReturnType<typeof handoff>; native: ReturnType<typeof response> } {
  const source = nativeHandoff(reader);
  const native = originalSajuResponse(reader);
  source.source.responseBodyHash = hashSajuHeldSourceProofRequestV1(native);
  rehash(source);
  return { source, native };
}


const PREVIEW_KEY = Buffer.alloc(32, 73);
const PREVIEW_NONCE = 'N'.repeat(24);
const ISSUED_AT = 1_800_000_000_000;
const PREVIEW_REQUEST = {
  birth: { calendarType: 'solar', date: '2024-03-10', time: '12:00' },
  reading: { text: '직업운' },
};
const PREVIEW_MAC_DOMAIN = 'myeongha/saju/source-transport-proof/v1\0';

function previewEnvelope(
  native: ReturnType<typeof response>,
  handoffSource: ReturnType<typeof handoff>['source'],
) {
  const material = {
    snapshotId: handoffSource.snapshotId,
    interpretationRunId: handoffSource.interpretationRunId,
    registrySnapshotId: handoffSource.registrySnapshotId,
    executionId: handoffSource.executionId,
    preparationId: handoffSource.preparationId,
    selectionId: handoffSource.selectionId,
    profileRef: { ...handoffSource.profileRef },
    evidenceBundleHash: handoffSource.evidenceBundleHash,
    readingId: native.reading.readingId,
    responseId: native.responseId,
    responseBodyHash: hashSajuHeldSourceProofRequestV1(native),
  };
  const payload = {
    version: 'myeonghwa-source-reading-transport-proof-v1',
    lifecycle: 'preview',
    issuer: 'saju-preview-service',
    audience: 'myeongha-api-service',
    keyId: 'preview-key-v1',
    nonce: PREVIEW_NONCE,
    issuedAtMs: ISSUED_AT,
    expiresAtMs: ISSUED_AT + 60_000,
    requestBodyHash: hashSajuHeldSourceProofRequestV1(PREVIEW_REQUEST),
    responseBodyHash: hashSajuHeldSourceProofRequestV1(native),
    material,
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false,
    canPublish: false,
    canSell: false,
  };
  return {
    schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
    lifecycle: 'preview',
    state: 'held',
    response: native,
    proof: {
      payload,
      signatureHex: createHmac('sha256', PREVIEW_KEY)
        .update(PREVIEW_MAC_DOMAIN)
        .update(hashSajuHeldSourceProofRequestV1(payload))
        .digest('hex'),
    },
    productionInterpretationAuthority: 'NOT_EVALUATED',
    releaseAuthorization: 'NOT_EVALUATED',
    canExecute: false,
    canPublish: false,
    canSell: false,
  };
}

function trust(): SajuHeldSourceProofVerifierTrustV1 {
  const claims = new Set<string>();
  return {
    trustedIssuer: 'saju-preview-service',
    expectedAudience: 'myeongha-api-service',
    trustedKeyId: 'preview-key-v1',
    keyBytes: PREVIEW_KEY,
    claimNonceOnce: vi.fn(async (key: string) => {
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    }),
  };
}
function context() {
  return {
    expectedNonce: PREVIEW_NONCE,
    expectedRequestBody: PREVIEW_REQUEST,
    nowMs: ISSUED_AT + 1_000,
  };
}
async function input() {
  const readerAdmission = admission();
  const recordValue = await record();
  const { source, native } = mappingWithExactOriginal(readerAdmission);
  return {
    readerAdmission,
    record: recordValue,
    sajuHandoff: source,
    previewEnvelope: previewEnvelope(native, source.source),
    trust: trust(),
    context: context(),
  };
}

describe('signed PREVIEW response vs DB ID-only Reading handoff, always HOLD', () => {
  it('cryptographically binds existing request, nonce, full response and all Saju source lineage to the same DB Reading', async () => {
    const test = await input();
    const result = await inspectSignedSajuDbReadingIdOnlyHandoffV1(test);
    expect(result).toEqual({
      contractVersion: 'saju-signed-id-only-reading-handoff-v1',
      state: 'held',
      transportIntegrity: 'VERIFIED',
      sourceAuthority: 'NOT_EVALUATED',
      mappingAuthority: 'NOT_EVALUATED',
      privacyApproval: 'NOT_EVALUATED',
      s5AtomicStorage: 'DB_OWNER_REQUIRED',
      s7Delivery: 'DB_OWNER_REQUIRED',
      canMapReadingId: false,
      canPersist: false,
      canDisclose: false,
      canPublish: false,
      canSell: false,
    });
    expect(test.trust.claimNonceOnce).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(result)).toBe(true);
    for (const token of [
      SUBJECT, READING, NATIVE_READING,
      test.sajuHandoff.source.responseBodyHash,
      '확인된 구조적',
    ]) expect(JSON.stringify(result)).not.toContain(token);
    // Reusing a valid Preview transport proof cannot re-claim its nonce.
    const replay = await inspectSignedSajuDbReadingIdOnlyHandoffV1(test);
    expect(replay).toMatchObject({
      state: 'blocked', transportIntegrity: 'NOT_VERIFIED',
      canMapReadingId: false, canDisclose: false,
    });
  });

  it('blocks wrong signer, nonce, normalized Saju request, expired envelope or missing nonce ledger', async () => {
    for (const variant of ['key', 'nonce', 'request', 'expired', 'no_ledger'] as const) {
      const t = await input();
      if (variant === 'key') {
        t.trust = { ...t.trust, keyBytes: Buffer.alloc(32, 33) };
      } else if (variant === 'nonce') {
        t.context = { ...t.context, expectedNonce: 'Z'.repeat(24) };
      } else if (variant === 'request') {
        t.context = { ...t.context, expectedRequestBody: {
          birth: PREVIEW_REQUEST.birth, reading: { text: '다른 영역' },
        } };
      } else if (variant === 'expired') {
        t.context = { ...t.context, nowMs: ISSUED_AT + 61_000 };
      } else {
        t.trust = { ...t.trust, claimNonceOnce: vi.fn(async () => false) };
      }
      expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1(t)).toMatchObject({
        state: 'blocked', transportIntegrity: 'NOT_VERIFIED',
        canMapReadingId: false, canPersist: false,
      });
    }
  });

  it('rejects content mismatch or source/DB UUID drift before claiming a valid nonce', async () => {
    const t = await input();
    const changedResponse = structuredClone(t.previewEnvelope);
    changedResponse.response.reading.generatedAt = '2026-10-24T00:00:00.000Z';
    expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
      ...t, previewEnvelope: changedResponse,
    })).toMatchObject({ state: 'blocked', canDisclose: false });
    expect(t.trust.claimNonceOnce).not.toHaveBeenCalled();

    const wrongScope = {
      ...t.readerAdmission,
      scope: { ...t.readerAdmission.scope, readingId: 'different-reading-id' },
    };
    expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
      ...t, readerAdmission: wrongScope,
    })).toMatchObject({ state: 'blocked', canMapReadingId: false });
    expect(t.trust.claimNonceOnce).not.toHaveBeenCalled();
  });

  it('rejects an invalid MAC or forged Preview-to-Production upgrade without issuing official authority', async () => {
    const test = await input();
    const forgedSignature = structuredClone(test.previewEnvelope);
    forgedSignature.proof.signatureHex = '0'.repeat(64);
    expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
      ...test, previewEnvelope: forgedSignature,
    })).toMatchObject({ state: 'blocked', canPersist: false });

    const elevated = structuredClone(test.previewEnvelope);
    elevated.lifecycle = 'production';
    expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
      ...test, previewEnvelope: elevated,
    })).toMatchObject({ state: 'blocked', canDisclose: false });
    expect(test.trust.claimNonceOnce).not.toHaveBeenCalled();
  });

  it('rejects validly signed but DIFFERENT Registry/Profile/Interpretation or Evidence lineage', async () => {
    for (const field of [
      'snapshotId', 'interpretationRunId', 'registrySnapshotId', 'executionId',
      'preparationId', 'selectionId', 'evidenceBundleHash',
    ] as const) {
      const test = await input();
      const altered = structuredClone(test.previewEnvelope);
      const material = altered.proof.payload.material;
      if (field === 'evidenceBundleHash') {
        material[field] = 'c'.repeat(64);
      } else {
        material[field] = 'other-' + field;
      }
      altered.proof.signatureHex = createHmac('sha256', PREVIEW_KEY)
        .update(PREVIEW_MAC_DOMAIN)
        .update(hashSajuHeldSourceProofRequestV1(altered.proof.payload))
        .digest('hex');
      expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
        ...test, previewEnvelope: altered,
      })).toMatchObject({ state: 'blocked', canMapReadingId: false });
    }
    const t = await input();
    const profile = structuredClone(t.previewEnvelope);
    profile.proof.payload.material.profileRef.version = 'other-profile';
    profile.proof.signatureHex = createHmac('sha256', PREVIEW_KEY)
      .update(PREVIEW_MAC_DOMAIN)
      .update(hashSajuHeldSourceProofRequestV1(profile.proof.payload))
      .digest('hex');
    expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
      ...t, previewEnvelope: profile,
    })).toMatchObject({ state: 'blocked', canPersist: false });
  });

  it('denies missing, unrelated or manipulated Saju handoff even for otherwise intact signed Preview', async () => {
    const t = await input();
    const wrong = structuredClone(t.sajuHandoff);
    wrong.source.responseBodyHash = 'f'.repeat(64);
    wrong.source.inventoryHash = hashSajuHeldSourceProofRequestV1({
      version: wrong.version, readingId: wrong.source.readingId,
      responseId: wrong.source.responseId,
      responseBodyHash: wrong.source.responseBodyHash,
      inventory: wrong.inventory,
    });
    for (const source of [wrong, null, { ...t.sajuHandoff, sourceAuthority: 'VERIFIED' }]) {
      expect(await inspectSignedSajuDbReadingIdOnlyHandoffV1({
        ...t, sajuHandoff: source,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
    expect(t.trust.claimNonceOnce).not.toHaveBeenCalled();
  });
});
