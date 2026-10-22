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
import { projectOfficialStandardReadingToProtectedCharacterSajuContextV1 } from './character-standard-reading-protected-context.js';
import { hashProtectedSajuTextV1 } from '../../../packages/domain/src/index.js';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import { preflightSajuReaderRecordsSourceInventoryParityV1 } from './official-reader-saju-source-inventory-parity-v1.js';
import { preflightSajuNativeDbReadingIdentityGapV1 } from './saju-native-db-reading-identity-gap-v1.js';
import { inspectSajuDbReadingIdOnlyResponseParityV1 } from './saju-db-reading-id-only-response-parity-v1.js';

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

describe('Saju Native Reading vs MyeongHa DB Official UUID mapping OWNER HOLD', () => {
  it('reports only an issuer/DB mapping gap for equal source text with TWO different Reading IDs', async () => {
    const readerAdmission = admission();
    const source = nativeHandoff(readerAdmission);
    const archive = await record();
    expect(preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission, record: archive, sajuHandoff: source,
    })).toMatchObject({ state: 'blocked', canPersist: false, canDisclose: false });

    const gap = preflightSajuNativeDbReadingIdentityGapV1({
      readerAdmission, record: archive, sajuHandoff: source,
    });
    expect(gap).toEqual({
      contractVersion: 'saju-native-db-reading-identity-gap-v1',
      state: 'held',
      reason: 'issuer_and_db_mapping_required',
      mappingAuthority: 'NOT_EVALUATED',
      sourceAuthority: 'NOT_EVALUATED',
      privacyApproval: 'NOT_EVALUATED',
      s5AtomicStorage: 'DB_OWNER_REQUIRED',
      s7Delivery: 'DB_OWNER_REQUIRED',
      canMapReadingId: false,
      canPersist: false,
      canDisclose: false,
      canPublish: false,
      canSell: false,
    });
    expect(Object.isFrozen(gap)).toBe(true);
    expect(JSON.stringify(gap)).not.toContain(READING);
    expect(JSON.stringify(gap)).not.toContain(NATIVE_READING);
    expect(JSON.stringify(gap)).not.toContain(source.source.responseBodyHash);
    expect(JSON.stringify(gap)).not.toContain('확인된');
  });

  it('refuses an invented Saju-to-DB identity swap or a forged Preview authority upgrade', async () => {
    const readerAdmission = admission();
    const valid = nativeHandoff(readerAdmission);
    const a = structuredClone(valid);
    a.source.readingId = READING;
    rehash(a);
    const b = { ...valid, sourceAuthority: 'PRODUCTION_APPROVED' };
    const c = { ...valid, canMapReadingId: true };
    const d = { ...valid, canDisclose: true };
    const e = structuredClone(valid);
    e.source.responseId = 'reading_response_' + 'z'.repeat(24);
    rehash(e);
    for (const changed of [a,b,c,d,e]) {
      const gap = preflightSajuNativeDbReadingIdentityGapV1({
        readerAdmission, record: await record(), sajuHandoff: changed,
      });
      expect(gap).toMatchObject({ canMapReadingId: false, canDisclose: false });
      expect(gap.state).toBe('blocked');
    }
  });

  it('blocks changed source segment, missing disclosure, broken inventory hash and changed source-ref order', async () => {
    const readerAdmission = admission();
    const source = nativeHandoff(readerAdmission);
    const changedUnits = structuredClone(source);
    changedUnits.inventory.segments[0]!.contentHash = 'sha256:v1:' + 'b'.repeat(64);
    rehash(changedUnits);
    const missingDisclosure = structuredClone(source);
    missingDisclosure.inventory.disclosures = [];
    rehash(missingDisclosure);
    const changedRef = structuredClone(source);
    changedRef.inventory.segments[0]!.sourceRef = 'response.reading.sections.9.blocks.0';
    rehash(changedRef);
    const invalidInventory = structuredClone(source);
    invalidInventory.source.inventoryHash = '0'.repeat(64);
    for (const changed of [changedUnits,missingDisclosure,changedRef,invalidInventory]) {
      expect(preflightSajuNativeDbReadingIdentityGapV1({
        readerAdmission,record:await record(),sajuHandoff:changed,
      })).toMatchObject({
        state:'blocked',canMapReadingId:false,canDisclose:false,
      });
    }
  });

  it('does not confuse agreement on text with proof of source response digest or Production issuer', async () => {
    const readerAdmission = admission();
    const candidate = nativeHandoff(readerAdmission);
    const first = preflightSajuNativeDbReadingIdentityGapV1({
      readerAdmission,record:await record(),sajuHandoff:candidate,
    });
    // Hash is self-consistent, but there is no original Saju body or issuer
    // signature here: NO verified source hash is claimed.
    candidate.source.responseBodyHash = 'a'.repeat(64);
    rehash(candidate);
    const second = preflightSajuNativeDbReadingIdentityGapV1({
      readerAdmission,record:await record(),sajuHandoff:candidate,
    });
    expect(first).toEqual(second);
    expect(first.state).toBe('held');
    expect(second).toMatchObject({
      mappingAuthority:'NOT_EVALUATED',sourceAuthority:'NOT_EVALUATED',
      canMapReadingId:false,canPersist:false,canDisclose:false,
    });
  });

  it('blocks mismatched DB owner Records source, response text, Reader scope or version without touching authority', async () => {
    const readerAdmission = admission();
    const candidate = nativeHandoff(readerAdmission);
    const cases = [
      { record: { ...(await record()),readingId:'another-record' },admission:readerAdmission },
      { record: { ...(await record()),readerCharacterIds:['baekheon'] },admission:readerAdmission },
      { record: { ...(await record()),reading:{...response(),reading:{
        ...response().reading, sections:[{sectionType:'career',title:'직업운',
          blocks:[{type:'paragraph',text:'변조된 근거'}]}],
      }} },admission:readerAdmission },
      { record: await record(),admission:{...readerAdmission,scope:{
        ...readerAdmission.scope,subjectId:'different-subject',
      }} },
      { record: await record(),admission:{...readerAdmission,scope:{
        ...readerAdmission.scope,readingContractVersion:'response-v3',
      }} },
    ];
    for (const testCase of cases) {
      expect(preflightSajuNativeDbReadingIdentityGapV1({
        readerAdmission:testCase.admission,record:testCase.record,sajuHandoff:candidate,
      })).toMatchObject({state:'blocked',canMapReadingId:false,canPersist:false});
    }
  });
});

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

describe('full ProductReadingResponse v2 parity with only native/DB Reading ID difference', () => {
  it('accepts exact whole response including untouched subject, chart, timestamp and disclosures but NEVER authorizes ID mapping', async () => {
    const readerAdmission = admission();
    const { source, native } = mappingWithExactOriginal(readerAdmission);
    const result = inspectSajuDbReadingIdOnlyResponseParityV1({
      readerAdmission, record: await record(), sajuHandoff: source, nativeSajuResponse: native,
    });
    expect(result).toEqual({
      contractVersion: 'saju-db-reading-id-only-response-parity-v1',
      state: 'held',
      reason: 'only_reading_id_payload_change_unattested',
      sourceAuthority: 'NOT_EVALUATED',
      mappingAuthority: 'NOT_EVALUATED',
      currentAccessAuthority: 'NOT_EVALUATED',
      s5AtomicStorage: 'DB_OWNER_REQUIRED',
      s7Delivery: 'DB_OWNER_REQUIRED',
      canMapReadingId: false,
      canPersist: false, canDisclose: false, canPublish: false, canSell: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(READING);
    expect(serialized).not.toContain(NATIVE_READING);
    expect(serialized).not.toContain('확인된');
  });

  it('rejects ANY native response change, even when an attacker recalculates its source digest and inventory digest', async () => {
    const readerAdmission = admission();
    const { source, native } = mappingWithExactOriginal(readerAdmission);
    const changedResponses: ReturnType<typeof response>[] = [];
    const alteredText = structuredClone(native);
    alteredText.reading.sections[0]!.blocks[0]!.text += ' 성공은 확정입니다';
    changedResponses.push(alteredText);
    const alteredDisclosure = structuredClone(native);
    alteredDisclosure.reading.disclosures[0]!.text += ' 개인 메시지';
    changedResponses.push(alteredDisclosure);
    const alteredSummary = structuredClone(native);
    alteredSummary.reading.calculationSummary.ambiguity.push({
      title: '새 모호성', summary: '검증되지 않음',
    });
    changedResponses.push(alteredSummary);
    const alteredTitle = structuredClone(native);
    alteredTitle.reading.sections[0]!.title = '미승인 직업운';
    changedResponses.push(alteredTitle);
    const alteredReadingId = structuredClone(native);
    alteredReadingId.reading.readingId = READING;
    changedResponses.push(alteredReadingId);
    const alteredState = structuredClone(native);
    alteredState.state = 'delivered_with_fallback';
    changedResponses.push(alteredState);
    const alteredCode = structuredClone(native);
    alteredCode.messageCode = 'READING_DELIVERED_WITH_GROUNDED_FALLBACK';
    changedResponses.push(alteredCode);

    for (const altered of changedResponses) {
      const forgedHandoff = structuredClone(source);
      forgedHandoff.source.responseBodyHash = hashSajuHeldSourceProofRequestV1(altered);
      rehash(forgedHandoff);
      expect(inspectSajuDbReadingIdOnlyResponseParityV1({
        readerAdmission,
        record: await record(),
        sajuHandoff: forgedHandoff,
        nativeSajuResponse: altered,
      })).toMatchObject({
        state: 'blocked', canMapReadingId: false, canDisclose: false,
      });
    }
  });

  it('rejects other changes in DB response even when all user-visible text and SourceUnits still match', async () => {
    const base = admission();
    const { source, native } = mappingWithExactOriginal(base);
    const alternativeStates = [
      { ...response(), reading: { ...response().reading, calculationSummary: {
        ambiguity: [{ title: 'hidden', summary: 'changed' }],
      } } },
      { ...response(), reading: { ...response().reading,
        generatedAt: '2026-10-23T00:00:00.000Z',
      } },
      { ...response(), reading: { ...response().reading,
        subject: { ...response().reading.subject, birthInputDisplay: {
          ...response().reading.subject.birthInputDisplay,
          date: '2025-04-11',
        } },
      } },
      { ...response(), coverage: {
        state: 'partial', hasAvailableEvidence: true, missingRequirementCount: 1,
      } },
    ];
    for (const stored of alternativeStates) {
      const readerAdmission: PreparedOfficialReadingReaderAdmissionV1 = {
        ...base,
        source: { ...base.source, responseSnapshotJsonb: stored },
      };
      // Records needs exactly the same independent DB response as Reader.
      const db = await record({ responseSnapshotJsonb: stored });
      expect(inspectSajuDbReadingIdOnlyResponseParityV1({
        readerAdmission, record: db, sajuHandoff: source, nativeSajuResponse: native,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
  });

  it('rejects omitted Saju source response, mismatched source BodyHash and malformed/partial v2 results', async () => {
    const readerAdmission = admission();
    const { source, native } = mappingWithExactOriginal(readerAdmission);
    const input = { readerAdmission, record: await record(), sajuHandoff: source };
    const badHash = structuredClone(source);
    badHash.source.responseBodyHash = '0'.repeat(64);
    rehash(badHash);
    const badVersion = structuredClone(native);
    badVersion.responseVersion = 'v3';
    const invalidBody = structuredClone(native);
    invalidBody.reading.sections[0]!.blocks[0]!.text = ' ';
    for (const pair of [
      { sajuHandoff: source, nativeSajuResponse: null },
      { sajuHandoff: source, nativeSajuResponse: { state: 'delivered' } },
      { sajuHandoff: badHash, nativeSajuResponse: native },
      { sajuHandoff: source, nativeSajuResponse: badVersion },
      { sajuHandoff: source, nativeSajuResponse: invalidBody },
    ]) {
      expect(inspectSajuDbReadingIdOnlyResponseParityV1({
        ...input, ...pair,
      })).toMatchObject({ state: 'blocked', canMapReadingId: false });
    }
  });
});
