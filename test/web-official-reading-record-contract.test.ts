import { describe, expect, it } from 'vitest';
import {
  OfficialReadingRecordContractErrorV1,
  parseOfficialReadingRecordPayloadV1,
} from '../apps/web/official-reading-record-contract.js';

const payload = {
  readingId: '44444444-4444-4444-8444-444444444444',
  readingSessionId: '55555555-5555-4555-8555-555555555555',
  sajuDomain: 'career',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  readerCharacterIds: ['seyeon'],
  completedAt: '2026-09-23T00:01:00.000Z',
  reading: {
    state: 'delivered',
    reading: { sections: [] },
  },
  responseHash: 'must-not-project',
};

describe('Official Reading Records browser contract', () => {
  it('projects the current Production stored Official Reading archive surface without widening authority', () => {
    const result = parseOfficialReadingRecordPayloadV1(payload);
    expect(result).toEqual({
      readingId: payload.readingId,
      readingSessionId: payload.readingSessionId,
      sajuDomain: 'career',
      readingContractVersion: 'product-reading.v1',
      productResponseState: 'delivered',
      readerCharacterIds: ['seyeon'],
      completedAt: '2026-09-23T00:01:00.000Z',
      reading: payload.reading,
    });
    expect(result).not.toHaveProperty('responseHash');
    expect(result).not.toHaveProperty('threadId');
  });

  it.each([
    { ...payload, readingId: 'reading-1' },
    { ...payload, readingSessionId: 'session-1' },
    { ...payload, readerCharacterIds: 'seyeon' },
    { ...payload, readerCharacterIds: ['seyeon', 'seyeon'] },
    { ...payload, completedAt: 'not-a-time' },
    { ...payload, sajuDomain: 'general_natal' },
    { ...payload, reading: null },
  ])('fails closed on malformed archive payload %#', (value) => {
    expect(() => parseOfficialReadingRecordPayloadV1(value)).toThrow(
      OfficialReadingRecordContractErrorV1,
    );
  });
});
