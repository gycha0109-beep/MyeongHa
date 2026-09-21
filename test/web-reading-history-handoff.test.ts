import { describe, expect, it } from 'vitest';

import {
  buildPersistedReadingHandoffUrlV1,
  createPersistedReadingHandoffV1,
  parsePersistedReadingHandoffV1,
} from '../apps/web/reading-history-handoff.js';

describe('persisted Reading browser handoff', () => {
  it('carries only stored Reading navigation identifiers', () => {
    const url = buildPersistedReadingHandoffUrlV1({
      readingId: ' reading-1 ',
      readingSessionId: ' session-1 ',
      sajuDomain: ' career ',
    });

    expect(url).toBe(
      'reading-detail.html?from=records&readingId=reading-1&readingSessionId=session-1&sajuDomain=career',
    );
    expect(url).not.toContain('reader=');
    expect(url).not.toContain('character=');
    expect(url).not.toContain('threadId=');
    expect(url).not.toContain('topic=');
    expect(url).not.toContain('scope=');
  });

  it('parses a Records handoff without turning hints into authority', () => {
    expect(parsePersistedReadingHandoffV1(
      '?from=records&readingId=reading-1&readingSessionId=session-1&sajuDomain=career',
    )).toEqual({
      state: 'ready',
      source: 'records',
      readingId: 'reading-1',
      readingSessionId: 'session-1',
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

  it('rejects unbounded identifiers before navigation', () => {
    expect(() => createPersistedReadingHandoffV1({
      readingId: '',
      readingSessionId: 'session-1',
      sajuDomain: 'career',
    })).toThrow(TypeError);

    expect(() => createPersistedReadingHandoffV1({
      readingId: 'reading-1',
      readingSessionId: 'session-1',
      sajuDomain: 'x'.repeat(129),
    })).toThrow(TypeError);
  });
});
