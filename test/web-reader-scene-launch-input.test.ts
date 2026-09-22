import { describe, expect, it } from 'vitest';

import {
  ReaderSceneLaunchInputErrorV1,
  createReaderSceneLaunchRequestV1,
} from '../apps/web/reader-scene-launch-input.js';

const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const READING_ID = '44444444-4444-4444-8444-444444444444';

function persistedReading() {
  return Object.freeze({
    state: 'ready',
    source: 'records',
    readingId: READING_ID,
    readingSessionId: '55555555-5555-4555-8555-555555555555',
    sajuDomain: 'career',
  });
}

describe('Reader Scene launch input boundary', () => {
  it('forms only threadId + candidate officialReadingId from source-backed identities', () => {
    expect(createReaderSceneLaunchRequestV1({
      threadId: `  ${THREAD_ID}  `,
      persistedReadingHandoff: persistedReading(),
    })).toEqual({
      threadId: THREAD_ID,
      officialReadingId: READING_ID,
    });
  });

  it('does not promote Records metadata or presentation hints into Reader authority', () => {
    const request = createReaderSceneLaunchRequestV1({
      threadId: THREAD_ID,
      persistedReadingHandoff: persistedReading(),
    });

    expect(request).not.toHaveProperty('readingSessionId');
    expect(request).not.toHaveProperty('sajuDomain');
    expect(request).not.toHaveProperty('readerCharacterId');
    expect(request).not.toHaveProperty('presentationHint');
    expect(Object.keys(request)).toEqual(['threadId', 'officialReadingId']);
  });

  it('requires a separately supplied thread candidate instead of inventing one from Records', () => {
    expect(() => createReaderSceneLaunchRequestV1({
      threadId: null,
      persistedReadingHandoff: persistedReading(),
    })).toThrow(ReaderSceneLaunchInputErrorV1);
  });

  it('rejects malformed Reading candidates before Reader transport', () => {
    expect(() => createReaderSceneLaunchRequestV1({
      threadId: THREAD_ID,
      persistedReadingHandoff: {
        ...persistedReading(),
        readingId: 'reading-1',
      },
    })).toThrow(ReaderSceneLaunchInputErrorV1);
  });

  it('rejects incomplete persisted Reading handoffs', () => {
    for (const persistedReadingHandoff of [
      { state: 'none' } as const,
      { state: 'invalid' } as const,
    ]) {
      expect(() => createReaderSceneLaunchRequestV1({
        threadId: THREAD_ID,
        persistedReadingHandoff,
      })).toThrowError(expect.objectContaining({
        code: 'READER_SCENE_READING_HANDOFF_REQUIRED',
      }));
    }
  });
});
