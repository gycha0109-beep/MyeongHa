import { describe, expect, it } from 'vitest';
import { validateProductionReadingHistoryPageV1 } from
  '../scripts/operations/verify-reading-history-pagination-v1.mjs';

const emptyPage = () => ({
  readings: [],
  pagination: { pageSize: 50, hasMore: false, nextCursor: null },
});

describe('Production Reading History first-page pagination', () => {
  it('accepts the exact empty page returned by the current HTTP contract', () => {
    expect(validateProductionReadingHistoryPageV1(emptyPage())).toEqual([]);
  });

  it('accepts the last page with a canonical reading item', () => {
    const item = { readingId: 'not-interpreted-by-pagination-guard' };
    expect(validateProductionReadingHistoryPageV1({
      readings: [item],
      pagination: { pageSize: 50, hasMore: false, nextCursor: null },
    })).toEqual([item]);
  });

  it('accepts a nonfinal page with an opaque subject-bound cursor', () => {
    const item = { readingId: 'not-interpreted-by-pagination-guard' };
    expect(validateProductionReadingHistoryPageV1({
      readings: [item],
      pagination: { pageSize: 50, hasMore: true, nextCursor: 'eyJ2IjoxfQ' },
    })).toEqual([item]);
  });

  it.each([
    ['extra data field', { ...emptyPage(), debug: 'internal' }],
    ['missing pagination', { readings: [] }],
    ['extra pagination field', {
      readings: [], pagination: { ...emptyPage().pagination, privateState: 'secret' },
    }],
    ['wrong default page size', {
      readings: [], pagination: { pageSize: 20, hasMore: false, nextCursor: null },
    }],
    ['boolean page size', {
      readings: [], pagination: { pageSize: true, hasMore: false, nextCursor: null },
    }],
    ['nonboolean hasMore', {
      readings: [], pagination: { pageSize: 50, hasMore: 'false', nextCursor: null },
    }],
    ['unexpected final cursor', {
      readings: [], pagination: { pageSize: 50, hasMore: false, nextCursor: 'abc' },
    }],
    ['empty page claiming more', {
      readings: [], pagination: { pageSize: 50, hasMore: true, nextCursor: 'abc' },
    }],
    ['missing next cursor for more results', {
      readings: [{}], pagination: { pageSize: 50, hasMore: true, nextCursor: null },
    }],
    ['invalid cursor encoding', {
      readings: [{}], pagination: { pageSize: 50, hasMore: true, nextCursor: 'a?b' },
    }],
    ['oversize page', {
      readings: Array.from({ length: 51 }, () => ({})),
      pagination: { pageSize: 50, hasMore: false, nextCursor: null },
    }],
  ])('rejects %s without logging any response contents', (_name, data) => {
    expect(() => validateProductionReadingHistoryPageV1(data)).toThrow();
  });
});
