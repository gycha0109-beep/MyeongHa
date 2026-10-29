import { describe, expect, it } from 'vitest';
import { hashSajuHeldSourceProofRequestV1 } from './saju-held-source-proof-verifier-v1.js';
import {
  getOfficialReadingRecord,
  OfficialReadingRecordReadAuthorityPortErrorV1,
  type OfficialReadingRecordAuthorityRowV1,
  type OfficialReadingRecordReadAuthorityPortV1,
} from './official-reading-record-read.js';

const READING_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SUBJECT_ID = '66666666-6666-4666-8666-666666666666';

const ROW: OfficialReadingRecordAuthorityRowV1 = Object.freeze({
  readingId: READING_ID,
  readingSessionId: SESSION_ID,
  sajuDomain: 'career',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  responseSnapshotJsonb: Object.freeze({
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    reading: Object.freeze({
      readingId: READING_ID,
      sections: Object.freeze([]),
    }),
  }),
  responseHash: 'sha256:stored-reading',
  readerCharacterIds: Object.freeze(['seyeon']),
  completedAt: '2026-09-23T00:01:00.000Z',
});

function port(row: OfficialReadingRecordAuthorityRowV1 | null): OfficialReadingRecordReadAuthorityPortV1 {
  return { readRecord: async () => row };
}

describe('Official Reading Records read contract', () => {
  it('projects the stored Official Reading separately from Reader runtime context', async () => {
    const result = await getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port(ROW),
    });

    expect(result).toEqual({
      readingId: READING_ID,
      readingSessionId: SESSION_ID,
      sajuDomain: 'career',
      readingContractVersion: 'myeonghwa-product-reading-response-v2',
      productResponseState: 'delivered',
      readerCharacterIds: ['seyeon'],
      completedAt: '2026-09-23T00:01:00.000Z',
      birthRevision: { issuedRevisionNo: null, currentRevisionNo: null, state: 'unknown' },
      reading: ROW.responseSnapshotJsonb,
    });
    expect(result).not.toHaveProperty('responseHash');
    expect(result).not.toHaveProperty('threadId');
    expect(result).not.toHaveProperty('readerContext');
  });

  it('compares stored self Birth revision without reconstructing or rewriting the official result', async () => {
    for (const birthRevision of [
      { issuedRevisionNo: 2, currentRevisionNo: 2, state: 'current' as const },
      { issuedRevisionNo: 2, currentRevisionNo: 3, state: 'changed' as const },
      { issuedRevisionNo: null, currentRevisionNo: null, state: 'unknown' as const },
    ]) {
      const result = await getOfficialReadingRecord({
        resolvedSubjectId: SUBJECT_ID,
        readingId: READING_ID,
        authorityPort: port({ ...ROW, birthRevision }),
      });
      expect(result.birthRevision).toEqual(birthRevision);
      expect(result.reading).toBe(ROW.responseSnapshotJsonb);
      expect(result).not.toHaveProperty('sourceBirthRevisionId');
      expect(result).not.toHaveProperty('currentBirthRevisionId');
    }
    for (const birthRevision of [
      { issuedRevisionNo: 1, currentRevisionNo: 2, state: 'current' as const },
      { issuedRevisionNo: null, currentRevisionNo: 2, state: 'changed' as const },
      { issuedRevisionNo: 1, currentRevisionNo: 1, state: 'changed' as const },
      { issuedRevisionNo: -1, currentRevisionNo: 2, state: 'unknown' as const },
    ]) {
      await expect(getOfficialReadingRecord({
        resolvedSubjectId: SUBJECT_ID,
        readingId: READING_ID,
        authorityPort: port({ ...ROW, birthRevision }),
      })).rejects.toThrow('Birth revision provenance is inconsistent');
    }
  });

  it('binds a server-pinned Reader hash to the Records DB row without returning the hash', async () => {
    const read = (expectedResponseHash: string) => getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      expectedResponseHash,
      authorityPort: port(ROW),
    });
    const admitted = await read(ROW.responseHash);
    expect(admitted.readingId).toBe(READING_ID);
    expect(admitted).not.toHaveProperty('responseHash');
    await expect(read('sha256:wrong-reader-row')).rejects.toThrow('stored hash differs');
    await expect(read('')).rejects.toThrow('stored hash differs');
  });

  it('rereads an issuer-hashed official report only when the stored body still matches the immutable digest', async () => {
    const immutable = {
      responseVersion: 'myeonghwa-product-reading-response-v2',
      responseId: 'reading_response_aaaaaaaaaaaaaaaaaaaaaaaa',
      state: 'delivered',
      messageCode: 'READING_DELIVERED',
      requiredAction: 'none',
      reading: {
        readingId: READING_ID,
        sections: [
          { sectionType: 'overview', state: 'complete', title: '공식 결과',
            blocks: [{ type: 'paragraph', text: '인증된 서버 원본입니다.' }] },
        ],
        disclosures: [{ type: 'scope_limitation', text: '이 명식의 출생시각은 확정되어 있습니다.' }],
      },
    };
    const issued = {
      ...ROW,
      responseSnapshotJsonb: immutable,
      responseHash: 'sha256:v1:' + hashSajuHeldSourceProofRequestV1(immutable),
    };
    const admitted = await getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID, readingId: READING_ID, authorityPort: port(issued),
    });
    expect(admitted.reading).toEqual(immutable);

    const modified = {
      ...immutable,
      reading: {
        ...(immutable.reading as Record<string, unknown>),
        sections: [
          { sectionType: 'overview', state: 'complete', title: '공식 결과',
            blocks: [{ type: 'paragraph', text: '원본을 변경한 내용입니다.' }] },
        ],
      },
    };
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID, readingId: READING_ID,
      authorityPort: port({ ...issued, responseSnapshotJsonb: modified }),
    })).rejects.toThrow('source response hash mismatch');
    // Even a rehashed malformed canonical envelope cannot be disclosed as a
    // successful official report. This guards the server's final read boundary.
    const noInterpretation = {
      ...immutable,
      reading: { ...immutable.reading, sections: [] },
    };
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID, readingId: READING_ID,
      authorityPort: port({
        ...issued,
        responseSnapshotJsonb: noInterpretation,
        responseHash: 'sha256:v1:' + hashSajuHeldSourceProofRequestV1(noInterpretation),
      }),
    })).rejects.toThrow('failed product admission');

    const mismatchedEnvelope = {
      ...immutable,
      messageCode: 'READING_EVIDENCE_INSUFFICIENT',
    };
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID, readingId: READING_ID,
      authorityPort: port({
        ...issued,
        responseSnapshotJsonb: mismatchedEnvelope,
        responseHash: 'sha256:v1:' + hashSajuHeldSourceProofRequestV1(mismatchedEnvelope),
      }),
    })).rejects.toThrow('failed product admission');
  });

  it('fails closed when the owner-scoped record does not exist', async () => {
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port(null),
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects malformed or mismatched Reading identity before projection', async () => {
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: 'reading-1',
      authorityPort: port(ROW),
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port({ ...ROW, readingId: '77777777-7777-4777-8777-777777777777' }),
    })).rejects.toThrow('different Reading identity');
  });

  it('fails closed on malformed stored Reading identities and Saju domain', async () => {
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port({ ...ROW, readingId: 'stored-reading' }),
    })).rejects.toThrow('invalid Stored Official Reading identity');

    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port({ ...ROW, readingSessionId: 'stored-session' }),
    })).rejects.toThrow('invalid Stored Reading Session identity');

    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port({ ...ROW, sajuDomain: 'career-ish' }),
    })).rejects.toThrow('invalid Saju domain');
  });

  it('admits only archive-openable Product response states', async () => {
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: port({
        ...ROW,
        productResponseState: 'delivered_with_fallback',
        responseSnapshotJsonb: {
          ...(ROW.responseSnapshotJsonb as Record<string, unknown>),
          state: 'delivered_with_fallback',
        },
      }),
    })).resolves.toMatchObject({
      readingId: READING_ID,
      productResponseState: 'delivered_with_fallback',
    });

    for (const productResponseState of ['clarification_required', 'pending']) {
      await expect(getOfficialReadingRecord({
        resolvedSubjectId: SUBJECT_ID,
        readingId: READING_ID,
        authorityPort: port({
          ...ROW,
          productResponseState,
          responseSnapshotJsonb: {
            ...(ROW.responseSnapshotJsonb as Record<string, unknown>),
            state: productResponseState,
          },
        }),
      })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('rejects stored snapshot provenance mismatches before archive projection', async () => {
    for (const responseSnapshotJsonb of [
      {
        ...(ROW.responseSnapshotJsonb as Record<string, unknown>),
        responseVersion: 'different-contract',
      },
      {
        ...(ROW.responseSnapshotJsonb as Record<string, unknown>),
        state: 'delivered_with_fallback',
      },
      {
        ...(ROW.responseSnapshotJsonb as Record<string, unknown>),
        reading: {
          readingId: '77777777-7777-4777-8777-777777777777',
          sections: [],
        },
      },
    ]) {
      await expect(getOfficialReadingRecord({
        resolvedSubjectId: SUBJECT_ID,
        readingId: READING_ID,
        authorityPort: port({ ...ROW, responseSnapshotJsonb }),
      })).rejects.toThrow(/snapshot/u);
    }
  });

  it('maps authority input rejection without leaking database details', async () => {
    await expect(getOfficialReadingRecord({
      resolvedSubjectId: SUBJECT_ID,
      readingId: READING_ID,
      authorityPort: {
        readRecord: async () => {
          throw new OfficialReadingRecordReadAuthorityPortErrorV1('INVALID_INPUT', 'invalid');
        },
      },
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
