import { describe, expect, it } from 'vitest';
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
  readingContractVersion: 'product-reading.v1',
  productResponseState: 'delivered',
  responseSnapshotJsonb: Object.freeze({
    responseVersion: 'product-reading.v1',
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
      readingContractVersion: 'product-reading.v1',
      productResponseState: 'delivered',
      readerCharacterIds: ['seyeon'],
      completedAt: '2026-09-23T00:01:00.000Z',
      reading: ROW.responseSnapshotJsonb,
    });
    expect(result).not.toHaveProperty('responseHash');
    expect(result).not.toHaveProperty('threadId');
    expect(result).not.toHaveProperty('readerContext');
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

  it('rejects stored snapshot provenance mismatches before archive projection', async () => {
    for (const responseSnapshotJsonb of [
      {
        ...ROW.responseSnapshotJsonb,
        responseVersion: 'different-contract',
      },
      {
        ...ROW.responseSnapshotJsonb,
        state: 'delivered_with_fallback',
      },
      {
        ...ROW.responseSnapshotJsonb,
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
