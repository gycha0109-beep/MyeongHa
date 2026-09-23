const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class OfficialReadingRecordContractErrorV1 extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'OfficialReadingRecordContractErrorV1';
  }
}

function fail(message) {
  throw new OfficialReadingRecordContractErrorV1(
    'Official Reading Records browser contract rejected response: ' + message,
  );
}

function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_V1.test(value.trim())) fail(field + ' is invalid');
  return value.trim();
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(field + ' is invalid');
  return value;
}

function requireTimestamp(value, field) {
  const stored = requireString(value, field);
  if (!Number.isFinite(Date.parse(stored))) fail(field + ' is invalid');
  return stored;
}

function requireReaderCharacterIds(value) {
  if (!Array.isArray(value)) fail('readerCharacterIds is invalid');
  const ids = value.map((item) => requireString(item, 'readerCharacterIds'));
  if (new Set(ids).size !== ids.length) fail('readerCharacterIds contains duplicates');
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (sorted.some((item, index) => item !== ids[index])) fail('readerCharacterIds is not deterministic');
  return Object.freeze(ids);
}

export function parseOfficialReadingRecordPayloadV1(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('payload is invalid');
  if (!payload.reading || typeof payload.reading !== 'object' || Array.isArray(payload.reading)) {
    fail('reading is invalid');
  }

  return Object.freeze({
    readingId: requireUuid(payload.readingId, 'readingId'),
    readingSessionId: requireUuid(payload.readingSessionId, 'readingSessionId'),
    sajuDomain: requireString(payload.sajuDomain, 'sajuDomain'),
    readingContractVersion: requireString(payload.readingContractVersion, 'readingContractVersion'),
    productResponseState: requireString(payload.productResponseState, 'productResponseState'),
    readerCharacterIds: requireReaderCharacterIds(payload.readerCharacterIds),
    completedAt: requireTimestamp(payload.completedAt, 'completedAt'),
    reading: Object.freeze({ ...payload.reading }),
  });
}
