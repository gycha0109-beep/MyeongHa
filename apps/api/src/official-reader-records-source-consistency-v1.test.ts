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
import { compareOfficialReaderRecordsSourceV1 } from
  './official-reader-records-source-consistency-v1.js';

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

describe('one DB Official Reading for admitted Reader and separately admitted Records', () => {
  it('holds identical source content without emitting a capability, source hash, grant or personal text', async () => {
    const result = compareOfficialReaderRecordsSourceV1({
      readerAdmission: admission(),
      record: await record(),
    });
    expect(result).toEqual({
      contractVersion: 'official-reader-records-source-consistency-v1',
      state: 'held',
      reason: 'exact_reading_reference_consistent_only',
      sourceAuthority: 'NOT_EVALUATED',
      privacyApproval: 'NOT_EVALUATED',
      currentAccessAuthority: 'NOT_EVALUATED',
      canPersist: false,
      canDisclose: false,
      canPublish: false,
      canSell: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(READING);
    expect(JSON.stringify(result)).not.toContain('확인된');
  });

  it('rejects different Reader, product, bundle, response hash, or Reading scope', async () => {
    const correctRecord = await record();
    const base = admission();
    const wrongs: PreparedOfficialReadingReaderAdmissionV1[] = [
      { ...base, scope: { ...base.scope, readingId: 'another-reading' } },
      { ...base, scope: { ...base.scope, readerCharacterId: 'baekheon' } },
      { ...base, source: { ...base.source, readerContentBundleId: 'other-bundle' } },
      { ...base, source: { ...base.source, productSpecVersion: 'changed-spec' } },
      { ...base, scope: { ...base.scope, officialArtifactResponseHash: 'hash-change' } },
      { ...base, source: { ...base.source, readingId: 'other-reading' } },
    ];
    for (const readerAdmission of wrongs) {
      expect(compareOfficialReaderRecordsSourceV1({
        readerAdmission,
        record: correctRecord,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
  });

  it('rejects altered Records identity, unrelated Reading content and fake Reader provenance', async () => {
    const original = admission();
    const correct = await record();
    const wrongRecords: OfficialReadingRecordV1[] = [
      { ...correct, readingId: 'different-reading' },
      { ...correct, readingSessionId: 'different-session' },
      { ...correct, sajuDomain: 'business' },
      { ...correct, readingContractVersion: 'v3' },
      { ...correct, productResponseState: 'delivered_with_fallback' },
      { ...correct, readerCharacterIds: ['baekheon'] },
      { ...correct, completedAt: '2026-10-22T04:05:00Z' },
      { ...correct, reading: {
        ...correct.reading,
        reading: {
          ...(correct.reading.reading as Record<string, unknown>),
          sections: [{
            sectionType: 'career', title: '직업운', state: 'complete',
            blocks: [{ type: 'paragraph', text: '위조된 미래 사건' }],
          }],
        },
      } },
    ];
    for (const other of wrongRecords) {
      expect(compareOfficialReaderRecordsSourceV1({
        readerAdmission: original,
        record: other,
      })).toMatchObject({ state: 'blocked', canDisclose: false });
    }
  });

  it('never uses a fallback, missing protected text, or revoked Records query as authorization', async () => {
    const base = admission();
    const correct = await record();
    expect(compareOfficialReaderRecordsSourceV1({
      readerAdmission: {
        ...base,
        source: {
          ...base.source,
          productResponseState: 'delivered_with_fallback',
          responseSnapshotJsonb: {
            ...response(), state: 'delivered_with_fallback',
          },
        },
      },
      record: correct,
    })).toMatchObject({ state: 'blocked', canPersist: false });

    expect(compareOfficialReaderRecordsSourceV1({
      readerAdmission: {
        ...base,
        source: {
          ...base.source,
          responseSnapshotJsonb: {
            ...response(),
            reading: {
              ...response().reading,
              sections: [{ sectionType: 'career', title: '직업운',
                blocks: [{ type: 'paragraph', text: '' }] }],
            },
          },
        },
      },
      record: correct,
    })).toMatchObject({ state: 'blocked', canDisclose: false });

    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT,
      readingId: READING,
      authorityPort: { readRecord: async () => null },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
