import { describe, expect, it } from 'vitest';
import {
  CollectionReadPaginationInputErrorV1,
  decodeOpaqueCollectionCursorV1,
  encodeOpaqueCollectionCursorV1,
  parseCollectionPageSizeV1,
  requireCursorTimestampV1,
  requireCursorUuidV1,
  requireExactCursorPositionKeysV1,
} from '../apps/api/src/collection-read-pagination.js';

const SUBJECT_ID = '92000000-0000-4000-8000-000000000001';
const OTHER_SUBJECT_ID = '92000000-0000-4000-8000-000000000002';

describe('collection read pagination v1', () => {
  it('defaults to 50 and accepts only explicit page sizes 1..50', () => {
    expect(parseCollectionPageSizeV1(new URLSearchParams())).toBe(50);
    expect(parseCollectionPageSizeV1(new URLSearchParams('pageSize=1'))).toBe(1);
    expect(parseCollectionPageSizeV1(new URLSearchParams('pageSize=50'))).toBe(50);

    for (const query of ['pageSize=0', 'pageSize=51', 'pageSize=-1', 'pageSize=1.5', 'pageSize=01']) {
      expect(() => parseCollectionPageSizeV1(new URLSearchParams(query)))
        .toThrow(CollectionReadPaginationInputErrorV1);
    }
    expect(() => parseCollectionPageSizeV1(new URLSearchParams('pageSize=1&pageSize=2')))
      .toThrow(CollectionReadPaginationInputErrorV1);
  });

  it('round-trips exact collection/subject-bound cursor position', () => {
    const cursor = encodeOpaqueCollectionCursorV1({
      collection: 'life-record',
      subjectId: SUBJECT_ID,
      position: Object.freeze({
        confirmedAt: '2026-09-03T00:00:00.000Z',
        createdAt: '2026-09-03T00:00:00.000Z',
        id: '11111111-1111-4111-8111-111111111111',
      }),
    });

    const position = decodeOpaqueCollectionCursorV1({
      cursor,
      collection: 'life-record',
      subjectId: SUBJECT_ID,
    });
    requireExactCursorPositionKeysV1(position, ['confirmedAt', 'createdAt', 'id']);

    expect(requireCursorTimestampV1('confirmedAt', position.confirmedAt))
      .toBe('2026-09-03T00:00:00.000Z');
    expect(requireCursorTimestampV1('createdAt', position.createdAt))
      .toBe('2026-09-03T00:00:00.000Z');
    expect(requireCursorUuidV1('id', position.id))
      .toBe('11111111-1111-4111-8111-111111111111');
  });

  it('fails closed for cross-subject and cross-collection cursor reuse', () => {
    const cursor = encodeOpaqueCollectionCursorV1({
      collection: 'memories',
      subjectId: SUBJECT_ID,
      position: Object.freeze({
        createdAt: '2026-09-04T00:00:00.000Z',
        id: '22222222-2222-4222-8222-222222222222',
      }),
    });

    expect(() => decodeOpaqueCollectionCursorV1({
      cursor,
      collection: 'memories',
      subjectId: OTHER_SUBJECT_ID,
    })).toThrow('subject binding');

    expect(() => decodeOpaqueCollectionCursorV1({
      cursor,
      collection: 'readings',
      subjectId: SUBJECT_ID,
    })).toThrow('version or collection');
  });

  it('rejects malformed, extra-field, and noncanonical cursor material', () => {
    expect(() => decodeOpaqueCollectionCursorV1({
      cursor: 'not*base64',
      collection: 'memories',
      subjectId: SUBJECT_ID,
    })).toThrow('encoding');

    const withExtra = Buffer.from(JSON.stringify({
      v: 1,
      collection: 'memories',
      subjectBinding: 'x',
      position: {},
      extra: true,
    }), 'utf8').toString('base64url');

    expect(() => decodeOpaqueCollectionCursorV1({
      cursor: withExtra,
      collection: 'memories',
      subjectId: SUBJECT_ID,
    })).toThrow('fields');

    expect(() => requireCursorTimestampV1('createdAt', '2026-09-04T00:00:00Z'))
      .toThrow('canonical ISO timestamp');
    expect(() => requireCursorUuidV1('id', 'not-a-uuid')).toThrow('invalid');
  });
});
