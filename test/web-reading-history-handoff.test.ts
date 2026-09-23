import { describe, expect, it } from 'vitest';

import {
  buildPersistedReadingHandoffUrlV1,
  createPersistedReadingHandoffV1,
  parsePersistedReadingHandoffV1,
} from '../apps/web/reading-history-handoff.js';

describe('persisted Reading browser handoff', () => {
  it('carries only stored Reading navigation identifiers', () => {
    const url = buildPersistedReadingHandoffUrlV1({
      readingId: ' 44444444-4444-4444-8444-444444444444 ',
      readingSessionId: ' 55555555-5555-4555-8555-555555555555 ',
      sajuDomain: ' career ',
    });

    expect(url).toBe(
      'reading-detail.html?from=records&readingId=44444444-4444-4444-8444-444444444444&readingSessionId=55555555-5555-4555-8555-555555555555&sajuDomain=career',
    );
    expect(url).not.toContain('reader=');
    expect(url).not.toContain('character=');
    expect(url).not.toContain('threadId=');
    expect(url).not.toContain('topic=');
    expect(url).not.toContain('scope=');
  });

  it('parses a Records handoff without turning hints into authority', () => {
    expect(parsePersistedReadingHandoffV1(
      '?from=records&readingId=44444444-4444-4444-8444-444444444444&readingSessionId=55555555-5555-4555-8555-555555555555&sajuDomain=career',
    )).toEqual({
      state: 'ready',
      source: 'records',
      readingId: '44444444-4444-4444-8444-444444444444',
      readingSessionId: '55555555-5555-4555-8555-555555555555',
      sajuDomain: 'career',
    });
  });

  it('returns none for ordinary Reading routes', () => {
    expect(parsePersistedReadingHandoffV1('?topic=career&scope=year')).toEqual({
      state: 'none',
    });
  });

  it('fails closed when a Records handoff is incomplete', () => {
    expect(parsePersistedReadingHandoffV1(
      '?from=records&readingId=reading-1&sajuDomain=career',
    )).toEqual({ state: 'invalid' });
  });

  it('fails closed on ambiguous or competing Records handoff authority', () => {
    const base = '?from=records&readingId=44444444-4444-4444-8444-444444444444&readingSessionId=55555555-5555-4555-8555-555555555555&sajuDomain=career';

    expect(parsePersistedReadingHandoffV1(
      `${base}&readingId=66666666-6666-4666-8666-666666666666`,
    )).toEqual({ state: 'invalid' });
    expect(parsePersistedReadingHandoffV1(
      `${base}&reader=seyeon`,
    )).toEqual({ state: 'invalid' });
    expect(parsePersistedReadingHandoffV1(
      `${base}&character=seyeon`,
    )).toEqual({ state: 'invalid' });
    expect(parsePersistedReadingHandoffV1(
      `${base}&threadId=77777777-7777-4777-8777-777777777777`,
    )).toEqual({ state: 'invalid' });
    expect(parsePersistedReadingHandoffV1(
      `${base}&topic=career&scope=natal`,
    )).toEqual({ state: 'invalid' });
    expect(parsePersistedReadingHandoffV1(
      `${base}&from=reading`,
    )).toEqual({ state: 'invalid' });
  });

  it('rejects unbounded identifiers before navigation', () => {
    expect(() => createPersistedReadingHandoffV1({
      readingId: '',
      readingSessionId: '55555555-5555-4555-8555-555555555555',
      sajuDomain: 'career',
    })).toThrow(TypeError);

    expect(() => createPersistedReadingHandoffV1({
      readingId: '44444444-4444-4444-8444-444444444444',
      readingSessionId: '55555555-5555-4555-8555-555555555555',
      sajuDomain: 'x'.repeat(129),
    })).toThrow(TypeError);
  });
});
