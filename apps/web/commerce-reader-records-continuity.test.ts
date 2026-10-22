import { describe, expect, it } from 'vitest';
import {
  buildVerifiedReaderRecordsEntryUrlV1,
  parseVerifiedReaderRecordsEntryV1,
  parseCurrentReaderRecordContinuityV1,
} from './commerce-reader-records-continuity.js';

const READING = '22222222-2222-4222-8222-222222222222';
const THREAD = '77777777-7777-4777-8777-777777777777';

const BIND = Object.freeze({
  contractVersion: 'commerce-reader-product-continuity-v1',
  officialReadingId: READING,
  readerCharacterId: 'baekheon',
  receiptBinding: 'issued',
  purchaseRole: 'initial_reading',
  summary: 'requires_authorized_saju_source_and_reader_delivery',
  readerFollowup: 'requires_fresh_exact_grant_and_existing_thread',
  recordDetail: 'requires_current_subject_owned_read',
  checkoutEnabled: false,
  paidContentRevealed: false,
} as const);

function envelope(readerFollowup: unknown, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      contractVersion: 'commerce-reader-record-continuity-v1',
      readingId: READING,
      readerCharacterId: 'baekheon',
      record: { state: 'owned_official_reading', completedAt: '2026-10-22T01:00:00.000Z' },
      readerFollowup,
      protectedAnswer: 'requires_separate_current_entitlement_and_saju_source',
      summary: 'not_confirmed_delivered',
      saleActivated: false,
      ...overrides,
    },
    meta: { apiContractVersion: 'v0.9', requestId: 'test', serverTime: '2026-10-22T02:00:00.000Z' },
  };
}

describe('Commerce verified Reader purchase -> single Official Records entry -> live Reader access', () => {
  it('creates only an inert navigational hint after a server-sourced exact receipt bind', () => {
    const url = buildVerifiedReaderRecordsEntryUrlV1(BIND);
    const parsed = parseVerifiedReaderRecordsEntryV1(new URL(url, 'https://myeongha.invalid').search);
    expect(parsed).toEqual({
      state: 'ready', readingId: READING, readerCharacterId: 'baekheon',
    });
    expect(url).not.toContain('receipt');
    expect(url).not.toContain('grant');
    expect(url).not.toContain('payment');
    expect(url).not.toContain('threadId');
    expect(url).not.toContain('body=');
    expect(buildVerifiedReaderRecordsEntryUrlV1({
      ...BIND, receiptBinding: 'historical_replay',
      purchaseRole: 'additional_reader_interpretation',
    })).toBe(url);
  });

  it('rejects client-provided paid release, arbitrary redirect and ambiguous hints', () => {
    expect(() => buildVerifiedReaderRecordsEntryUrlV1({
      ...BIND, checkoutEnabled: true,
    } as never)).toThrow();
    expect(() => buildVerifiedReaderRecordsEntryUrlV1({
      ...BIND, paidContentRevealed: true,
    } as never)).toThrow();
    expect(() => buildVerifiedReaderRecordsEntryUrlV1(BIND, 'https://attacker.invalid')).toThrow();
    expect(parseVerifiedReaderRecordsEntryV1(
      '?tab=saju&from=verified-reader-purchase&readingId=' + READING
        + '&readerCharacterId=baekheon&readerCharacterId=seyeon',
    )).toEqual({ state: 'invalid' });
    expect(parseVerifiedReaderRecordsEntryV1(
      '?tab=saju&from=verified-reader-purchase&readingId=' + READING
        + '&readerCharacterId=baekheon&grantId=fake',
    )).toEqual({ state: 'invalid' });
    expect(parseVerifiedReaderRecordsEntryV1('?tab=saju')).toEqual({state: 'none'});
  });

  it('never grants a new paid reading from a navigation-only existing thread candidate', () => {
    const current = parseCurrentReaderRecordContinuityV1(
      envelope({
        state: 'existing_thread_candidate',
        threadId: THREAD,
        requiresFreshGateAtUse: true,
      }),
      { readingId: READING, readerCharacterId: 'baekheon' },
    );
    expect(current).toEqual({
      state: 'existing_thread_candidate',
      readingId: READING, readerCharacterId: 'baekheon', threadId: THREAD,
    });
    expect(current).not.toHaveProperty('grantId');
    expect(current).not.toHaveProperty('report');
    expect(current).not.toHaveProperty('memory');
    expect(current).not.toHaveProperty('body');
  });

  it('keeps a previously owned Official Reading independent of missing current Reader rights', () => {
    const current = parseCurrentReaderRecordContinuityV1(
      envelope({ state: 'not_available', requiresFreshGateAtUse: true }),
      { readingId: READING, readerCharacterId: 'baekheon' },
    );
    expect(current).toEqual({
      state: 'not_available', readingId: READING, readerCharacterId: 'baekheon',
    });
  });

  it('rejects a cross-Reading, cross-Reader, hidden entitlement or false sales authority', () => {
    const candidate = {
      state: 'existing_thread_candidate', threadId: THREAD,
      requiresFreshGateAtUse: true,
    };
    for (const wrong of [
      { readerCharacterId: 'seyeon' },
      { readingId: '11111111-1111-4111-8111-111111111111' },
      { saleActivated: true },
      { summary: 'delivered' },
      { hiddenGrantId: 'fake' },
    ]) {
      expect(() => parseCurrentReaderRecordContinuityV1(
        envelope(candidate, wrong),
        { readingId: READING, readerCharacterId: 'baekheon' },
      )).toThrow();
    }
    expect(() => parseCurrentReaderRecordContinuityV1(
      envelope({ ...candidate, requiresFreshGateAtUse: false }),
      { readingId: READING, readerCharacterId: 'baekheon' },
    )).toThrow();
  });
});
