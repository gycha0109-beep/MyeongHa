import { describe, expect, it } from 'vitest';

import {
  ReadingHistoryContractErrorV1,
  parseReadingHistoryPayloadV1,
} from '../apps/web/reading-history-contract.js';

const READING_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';

function payload() {
  return {
    readings: [
      {
        readingId: READING_ID,
        readingSessionId: SESSION_ID,
        sajuDomain: 'career',
        readingContractVersion: 'reading-v1',
        productResponseState: 'delivered',
        createdAt: '2026-09-22T00:00:00.000Z',
        completedAt: '2026-09-22T00:01:00.000Z',
        internalAuthority: 'must-not-project',
      },
    ],
    internalCursor: 'must-not-project',
  };
}

describe('Reading History browser contract', () => {
  it('projects the bounded persisted Reading navigation DTO', () => {
    expect(parseReadingHistoryPayloadV1(payload())).toEqual({
      readings: [{
        readingId: READING_ID,
        readingSessionId: SESSION_ID,
        sajuDomain: 'career',
        readingContractVersion: 'reading-v1',
        productResponseState: 'delivered',
        createdAt: '2026-09-22T00:00:00.000Z',
        completedAt: '2026-09-22T00:01:00.000Z',
      }],
    });
  });

  it('accepts an empty authoritative Reading history', () => {
    expect(parseReadingHistoryPayloadV1({ readings: [] })).toEqual({
      readings: [],
    });
  });

  it.each([
    { ...payload(), readings: 'not-an-array' },
    { readings: [{ ...payload().readings[0], readingId: 'reading-1' }] },
    { readings: [{ ...payload().readings[0], readingSessionId: 'session-1' }] },
    { readings: [{ ...payload().readings[0], completedAt: 'not-a-time' }] },
    { readings: [payload().readings[0], payload().readings[0]] },
  ])('rejects malformed persisted Reading authority %#', (value) => {
    expect(() => parseReadingHistoryPayloadV1(value)).toThrow(
      ReadingHistoryContractErrorV1,
    );
  });
});
