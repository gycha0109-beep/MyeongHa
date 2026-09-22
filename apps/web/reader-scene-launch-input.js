const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ReaderSceneLaunchInputErrorV1 extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'ReaderSceneLaunchInputErrorV1';
    this.code = code;
  }
}

function requireUuid(value, field) {
  if (typeof value !== 'string') {
    throw new ReaderSceneLaunchInputErrorV1(
      'READER_SCENE_LAUNCH_INVALID',
      field + ' must be a UUID string.',
    );
  }
  const normalized = value.trim();
  if (!UUID_V1.test(normalized)) {
    throw new ReaderSceneLaunchInputErrorV1(
      'READER_SCENE_LAUNCH_INVALID',
      field + ' must be a UUID string.',
    );
  }
  return normalized;
}

function requirePersistedReadingHandoff(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.state !== 'ready' ||
    value.source !== 'records'
  ) {
    throw new ReaderSceneLaunchInputErrorV1(
      'READER_SCENE_READING_HANDOFF_REQUIRED',
      'Reader Scene launch requires a ready persisted Reading handoff.',
    );
  }
  return value;
}

/**
 * Forms only candidate identifiers for the server-authorized Reader Preview.
 *
 * Records readingId can name an Official Standard Reading because migration 1220
 * pins standard_reading_official_bindings.reading_id to readings.id. The browser
 * does not assert that the candidate is official or accessible: the server must
 * re-resolve the owned thread, official binding, Reader access, and artifact.
 */
export function createReaderSceneLaunchRequestV1(input) {
  const persistedReadingHandoff = requirePersistedReadingHandoff(
    input?.persistedReadingHandoff,
  );
  const threadId = requireUuid(input?.threadId, 'threadId');
  const officialReadingId = requireUuid(
    persistedReadingHandoff.readingId,
    'persistedReadingHandoff.readingId',
  );

  return Object.freeze({
    threadId,
    officialReadingId,
  });
}
