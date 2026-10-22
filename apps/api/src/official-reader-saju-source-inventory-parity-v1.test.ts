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
import {
  preflightSajuReaderRecordsSourceInventoryParityV1,
} from './official-reader-saju-source-inventory-parity-v1.js';

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
    reading: {
      readingId: READING,
      sections: [{
        sectionType: 'career',
        title: '직업운',
        state: 'complete',
        blocks: [{ type: 'paragraph', text: '확인된 구조적 맥락만 설명합니다.' }],
      }],
      disclosures: [{ type: 'scope_limitation', text: '미래 사건은 확정할 수 없습니다.' }],
      calculationSummary: { ambiguity: [] },
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

describe('Saju v2 SourceUnit / DB-admitted Reader / Records exact-reference parity', () => {
  it('reports only HELD for complete identical source text, disclosures, ambiguity and hashes', async () => {
    const readerAdmission = admission();
    const result = preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission,
      record: await record(),
      sajuHandoff: handoff(readerAdmission),
    });
    expect(result).toEqual({
      contractVersion: 'official-reader-saju-source-inventory-parity-v1',
      state: 'held',
      sourceAuthority: 'NOT_EVALUATED',
      s5AtomicStorage: 'DB_OWNER_REQUIRED',
      s7Delivery: 'DB_OWNER_REQUIRED',
      canPersist: false, canDisclose: false, canPublish: false, canSell: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(READING);
    expect(JSON.stringify(result)).not.toContain('확인된');
  });

  it('never silently maps native Saju hash Reading ID to an unrelated DB Official UUID', async () => {
    const readerAdmission = admission();
    const received = handoff(readerAdmission);
    const forged = structuredClone(received);
    forged.source.readingId = 'official_reading_' + 'c'.repeat(24);
    forged.source.inventoryHash = hashSajuHeldSourceProofRequestV1({
      version: forged.version,
      readingId: forged.source.readingId,
      responseId: forged.source.responseId,
      responseBodyHash: forged.source.responseBodyHash,
      inventory: forged.inventory,
    });
    expect(preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission, record: await record(), sajuHandoff: forged,
    })).toMatchObject({ state: 'blocked', canDisclose: false, canPersist: false });
  });

  it('rejects modified source unit hashes, missing disclosures, ambiguity, inventory and response digests', async () => {
    const readerAdmission = admission();
    const baseline = handoff(readerAdmission);
    const cases: unknown[] = [];
    const tamperedUnit = structuredClone(baseline);
    tamperedUnit.inventory.segments[0]!.contentHash = 'sha256:v1:' + 'f'.repeat(64);
    cases.push(tamperedUnit);
    const droppedDisclosure = structuredClone(baseline);
    droppedDisclosure.inventory.disclosures = [];
    cases.push(droppedDisclosure);
    const extraAmbiguity = structuredClone(baseline);
    extraAmbiguity.inventory.ambiguityHashes = ['sha256:v1:' + 'f'.repeat(64)];
    cases.push(extraAmbiguity);
    const swappedDigest = structuredClone(baseline);
    swappedDigest.source.inventoryHash = 'f'.repeat(64);
    cases.push(swappedDigest);
    const modifiedReading = structuredClone(baseline);
    modifiedReading.source.responseBodyHash = 'b'.repeat(64);
    cases.push(modifiedReading);
    const fakeResponse = structuredClone(baseline);
    fakeResponse.source.responseId = 'reading_response_' + 'f'.repeat(24);
    cases.push(fakeResponse);
    const missingProfile = structuredClone(baseline);
    missingProfile.source.profileRef.contentHash = 'not-a-hash';
    cases.push(missingProfile);
    for (const sajuHandoff of cases) {
      expect(preflightSajuReaderRecordsSourceInventoryParityV1({
        readerAdmission, record: await record(), sajuHandoff,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
  });

  it('blocks Preview escalation even if source unit bytes are valid', async () => {
    const readerAdmission = admission();
    const baseline = handoff(readerAdmission);
    for (const change of [
      { state: 'approved' },
      { lifecycle: 'production' },
      { sourceAuthority: 'VERIFIED' },
      { releaseAuthorization: 'APPROVED' },
      { canPersist: true },
      { canPublish: true },
      { canSell: true },
      { canDisclose: true },
      { mayIssueS3OfficialCoverageCandidate: true },
    ]) {
      expect(preflightSajuReaderRecordsSourceInventoryParityV1({
        readerAdmission,
        record: await record(),
        sajuHandoff: { ...baseline, ...change },
      })).toMatchObject({ state: 'blocked', canPublish: false });
    }
  });

  it('blocks mismatched independent Records admission, fallback and changed Reader text', async () => {
    const readerAdmission = admission();
    const checkedRecord = await record();
    expect(preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission,
      record: { ...checkedRecord, readerCharacterIds: ['baekheon'] },
      sajuHandoff: handoff(readerAdmission),
    })).toMatchObject({ state: 'blocked' });

    const wrongResponse = structuredClone(readerAdmission);
    const body = wrongResponse.source.responseSnapshotJsonb as ReturnType<typeof response>;
    body.reading.sections[0]!.blocks[0]!.text = '원본과 다른 문장';
    expect(preflightSajuReaderRecordsSourceInventoryParityV1({
      readerAdmission: wrongResponse,
      record: checkedRecord,
      sajuHandoff: handoff(readerAdmission),
    })).toMatchObject({ state: 'blocked' });
  });
});
