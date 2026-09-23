import { normalizeSajuDomainV1 } from './saju-domain-contract.js';

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ARCHIVE_OPENABLE_PRODUCT_RESPONSE_STATES_V1 = new Set([
  'delivered',
  'delivered_with_fallback',
]);

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

function requireSajuDomain(value, field) {
  const normalized = normalizeSajuDomainV1(value);
  if (normalized === null) fail(field + ' is invalid');
  return normalized;
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

function requireReadingSnapshot(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('reading is invalid');
  }

  const responseVersion = requireString(value.responseVersion, 'reading.responseVersion');
  if (responseVersion !== expected.readingContractVersion) {
    fail('reading.responseVersion does not match readingContractVersion');
  }

  const responseState = requireString(value.state, 'reading.state');
  if (responseState !== expected.productResponseState) {
    fail('reading.state does not match productResponseState');
  }

  if (!value.reading || typeof value.reading !== 'object' || Array.isArray(value.reading)) {
    fail('reading.reading is invalid');
  }
  const snapshotReadingId = requireUuid(value.reading.readingId, 'reading.reading.readingId');
  if (snapshotReadingId !== expected.readingId) {
    fail('reading.reading.readingId does not match readingId');
  }

  return Object.freeze({ ...value });
}

export function parseOfficialReadingRecordPayloadV1(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('payload is invalid');

  const readingId = requireUuid(payload.readingId, 'readingId');
  const readingContractVersion = requireString(
    payload.readingContractVersion,
    'readingContractVersion',
  );
  const productResponseState = requireString(payload.productResponseState, 'productResponseState');
  if (!ARCHIVE_OPENABLE_PRODUCT_RESPONSE_STATES_V1.has(productResponseState)) {
    fail('productResponseState is not archive-openable');
  }
  const reading = requireReadingSnapshot(payload.reading, {
    readingId,
    readingContractVersion,
    productResponseState,
  });

  return Object.freeze({
    readingId,
    readingSessionId: requireUuid(payload.readingSessionId, 'readingSessionId'),
    sajuDomain: requireSajuDomain(payload.sajuDomain, 'sajuDomain'),
    readingContractVersion,
    productResponseState,
    readerCharacterIds: requireReaderCharacterIds(payload.readerCharacterIds),
    completedAt: requireTimestamp(payload.completedAt, 'completedAt'),
    reading,
  });
}
