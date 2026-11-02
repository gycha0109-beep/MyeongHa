import { describe, expect, it } from 'vitest';
import { parseOfficialReadingRecordPayloadV1 } from '../official-reading-record-contract.js';

const readingId = '44444444-4444-4444-8444-444444444444';
const base = {
  readingId,
  readingSessionId: '55555555-5555-4555-8555-555555555555',
  sajuDomain: 'career',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  readerCharacterIds: [],
  completedAt: '2026-10-28T00:00:00.000Z',
  reading: {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    reading: { readingId, sections: [], disclosures: [] },
  },
};

describe('Official report Birth revision comparison contract', () => {
  it('accepts same and changed self Birth revisions without changing saved Reading content', () => {
    for (const birthRevision of [
      { issuedRevisionNo: 1, currentRevisionNo: 1, state: 'current' },
      { issuedRevisionNo: 1, currentRevisionNo: 3, state: 'changed' },
    ]) {
      const payload = parseOfficialReadingRecordPayloadV1({ ...base, birthRevision });
      expect(payload.birthRevision).toEqual(birthRevision);
      expect(payload.reading).toEqual(base.reading);
    }
  });

  it('retains unknown when a legacy report omits issuance provenance', () => {
    expect(parseOfficialReadingRecordPayloadV1(base).birthRevision).toEqual({
      issuedRevisionNo: null, currentRevisionNo: null, state: 'unknown',
    });
    expect(parseOfficialReadingRecordPayloadV1({
      ...base,
      birthRevision: { issuedRevisionNo: null, currentRevisionNo: null, state: 'unknown' },
    }).birthRevision.state).toBe('unknown');
  });

  it('rejects forged or inconsistent Birth revision statuses', () => {
    for (const birthRevision of [
      { issuedRevisionNo: null, currentRevisionNo: 2, state: 'changed' },
      { issuedRevisionNo: 1, currentRevisionNo: 1, state: 'changed' },
      { issuedRevisionNo: 1, currentRevisionNo: 2, state: 'current' },
      { issuedRevisionNo: -1, currentRevisionNo: null, state: 'unknown' },
      { issuedRevisionNo: 1, currentRevisionNo: 2, state: 'approved' },
      { issuedRevisionNo: 1, currentRevisionNo: 2 },
    ]) {
      expect(() => parseOfficialReadingRecordPayloadV1({
        ...base, birthRevision,
      })).toThrow('birthRevision');
    }
  });
});
