import {
  projectProductReadingResponseV2,
  type ProductReadingDisplayResultV2,
} from './product-reading-display.js';
import {
  MyeongHaApiClientErrorV1,
  type MyeongHaApiClientV1,
} from './http.js';

export interface RecordsPageOptionsV1 {
  readonly pageSize?: number;
  readonly cursor?: string;
}

export interface CollectionPaginationV1 {
  readonly pageSize: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

export interface LifeRecordFactV1 {
  readonly lifeFactId: string;
  readonly factType: string;
  readonly schemaVersion: string;
  readonly valueJsonb: unknown;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceKind: string;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
  readonly supersedesFactId: string | null;
  readonly confirmedAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface ReadingHistoryItemV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly readerCharacterIds: readonly string[];
  readonly createdAt: string;
  readonly completedAt: string;
}

export interface MemoryItemV1 {
  readonly memoryItemId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly contentJsonb: unknown;
  readonly createdByCharacterId: string | null;
  readonly createdAt: string;
}

export interface LifeRecordPageV1 {
  readonly facts: readonly LifeRecordFactV1[];
  readonly pagination: CollectionPaginationV1;
}

export interface ReadingHistoryPageV1 {
  readonly readings: readonly ReadingHistoryItemV1[];
  readonly pagination: CollectionPaginationV1;
}

export interface MemoryPageV1 {
  readonly memories: readonly MemoryItemV1[];
  readonly pagination: CollectionPaginationV1;
}

export interface OfficialReadingRecordV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: 'delivered' | 'delivered_with_fallback';
  readonly readerCharacterIds: readonly string[];
  readonly completedAt: string;
  readonly display: Extract<ProductReadingDisplayResultV2, { kind: 'delivered' }>;
}

function malformed(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'API_RECORDS_RESPONSE_INVALID',
    message,
  );
}

function clientInput(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_RECORDS_PAGE_INVALID',
    message,
  );
}

function detailClientInput(message: string): never {
  throw new MyeongHaApiClientErrorV1(
    'malformed_response',
    'CLIENT_OFFICIAL_READING_ID_INVALID',
    message,
  );
}

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAJU_DOMAINS_V1 = new Set([
  'general',
  'family',
  'relationship',
  'compatibility',
  'career',
  'business',
  'wealth',
  'life_stage',
  'question_specific',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return malformed(`Records ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireString(name, value);
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireString(name, value);
  if (!Number.isFinite(Date.parse(stored))) {
    return malformed(`Records ${name} is invalid.`);
  }
  return stored;
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireTimestamp(name, value);
}

function parsePagination(value: unknown): CollectionPaginationV1 {
  if (!isRecord(value)) return malformed('pagination is invalid.');
  if (
    typeof value.pageSize !== 'number' ||
    !Number.isSafeInteger(value.pageSize) ||
    value.pageSize < 1 ||
    value.pageSize > 50
  ) {
    return malformed('pagination pageSize is invalid.');
  }
  if (typeof value.hasMore !== 'boolean') {
    return malformed('pagination hasMore is invalid.');
  }
  if (value.hasMore) {
    const nextCursor = requireString('pagination nextCursor', value.nextCursor);
    return Object.freeze({
      pageSize: value.pageSize,
      hasMore: true,
      nextCursor,
    });
  }
  if (value.nextCursor !== null) {
    return malformed('terminal pagination must have a null nextCursor.');
  }
  return Object.freeze({
    pageSize: value.pageSize,
    hasMore: false,
    nextCursor: null,
  });
}

function parseLifeFact(value: unknown): LifeRecordFactV1 {
  if (!isRecord(value)) return malformed('Life Fact is invalid.');
  if (!Object.prototype.hasOwnProperty.call(value, 'valueJsonb') || value.valueJsonb === undefined) {
    return malformed('Life Fact valueJsonb is invalid.');
  }
  return Object.freeze({
    lifeFactId: requireString('Life Fact identity', value.lifeFactId),
    factType: requireString('Life Fact type', value.factType),
    schemaVersion: requireString('Life Fact schemaVersion', value.schemaVersion),
    valueJsonb: value.valueJsonb,
    validFrom: requireNullableTimestamp('Life Fact validFrom', value.validFrom),
    validTo: requireNullableTimestamp('Life Fact validTo', value.validTo),
    sourceKind: requireString('Life Fact sourceKind', value.sourceKind),
    sourceMessageId: requireNullableString('Life Fact sourceMessageId', value.sourceMessageId),
    sourceMergeActionId: requireNullableString(
      'Life Fact sourceMergeActionId',
      value.sourceMergeActionId,
    ),
    supersedesFactId: requireNullableString(
      'Life Fact supersedesFactId',
      value.supersedesFactId,
    ),
    confirmedAt: requireTimestamp('Life Fact confirmedAt', value.confirmedAt),
    revokedAt: requireNullableTimestamp('Life Fact revokedAt', value.revokedAt),
    createdAt: requireTimestamp('Life Fact createdAt', value.createdAt),
  });
}

function parseReaderCharacterIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return malformed('Reading readerCharacterIds is invalid.');
  const ids = value.map((item) => requireString('Reading readerCharacterId', item));
  if (new Set(ids).size !== ids.length) {
    return malformed('Reading readerCharacterIds contain duplicates.');
  }
  return Object.freeze(ids);
}

function parseReading(value: unknown): ReadingHistoryItemV1 {
  if (!isRecord(value)) return malformed('Reading history item is invalid.');
  return Object.freeze({
    readingId: requireString('Reading identity', value.readingId),
    readingSessionId: requireString('Reading Session identity', value.readingSessionId),
    sajuDomain: requireString('Reading sajuDomain', value.sajuDomain),
    readingContractVersion: requireString(
      'Reading contract version',
      value.readingContractVersion,
    ),
    productResponseState: requireString(
      'Reading product response state',
      value.productResponseState,
    ),
    readerCharacterIds: parseReaderCharacterIds(value.readerCharacterIds),
    createdAt: requireTimestamp('Reading createdAt', value.createdAt),
    completedAt: requireTimestamp('Reading completedAt', value.completedAt),
  });
}

function parseMemory(value: unknown): MemoryItemV1 {
  if (!isRecord(value)) return malformed('Memory item is invalid.');
  if (!Object.prototype.hasOwnProperty.call(value, 'contentJsonb') || value.contentJsonb === undefined) {
    return malformed('Memory contentJsonb is invalid.');
  }
  return Object.freeze({
    memoryItemId: requireString('Memory identity', value.memoryItemId),
    memoryType: requireString('Memory type', value.memoryType),
    schemaVersion: requireString('Memory schemaVersion', value.schemaVersion),
    contentJsonb: value.contentJsonb,
    createdByCharacterId: requireNullableString(
      'Memory createdByCharacterId',
      value.createdByCharacterId,
    ),
    createdAt: requireTimestamp('Memory createdAt', value.createdAt),
  });
}

function parseUniqueItems<T>(
  value: unknown,
  name: string,
  parse: (item: unknown) => T,
  identity: (item: T) => string,
): readonly T[] {
  if (!Array.isArray(value)) return malformed(`${name} collection is invalid.`);
  const seen = new Set<string>();
  const items = value.map((raw) => {
    const item = parse(raw);
    const id = identity(item);
    if (seen.has(id)) return malformed(`${name} collection contains a duplicate identity.`);
    seen.add(id);
    return item;
  });
  return Object.freeze(items);
}

function normalizePageOptions(options: RecordsPageOptionsV1 = {}): Readonly<{
  pageSize: number;
  cursor: string | null;
}> {
  const pageSize = options.pageSize ?? 20;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return clientInput('Records pageSize must be between 1 and 50.');
  }
  let cursor: string | null = null;
  if (options.cursor !== undefined) {
    if (typeof options.cursor !== 'string' || options.cursor.trim().length === 0) {
      return clientInput('Records cursor must be a non-empty opaque string.');
    }
    cursor = options.cursor;
  }
  return Object.freeze({ pageSize, cursor });
}

function pagePath(route: string, options: RecordsPageOptionsV1): string {
  const normalized = normalizePageOptions(options);
  const search = new URLSearchParams({ pageSize: String(normalized.pageSize) });
  if (normalized.cursor !== null) search.set('cursor', normalized.cursor);
  return `${route}?${search.toString()}`;
}

function requirePageBound(itemsLength: number, pagination: CollectionPaginationV1): void {
  if (itemsLength > pagination.pageSize) {
    malformed('Records collection exceeds its declared pageSize.');
  }
}

export async function readLifeRecordPageV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  options: RecordsPageOptionsV1 = {},
): Promise<LifeRecordPageV1> {
  const data = await client.requestData({
    method: 'GET',
    path: pagePath('/api/life-record', options),
    bearer,
  });
  if (!isRecord(data)) return malformed('Life Record response is invalid.');
  const facts = parseUniqueItems(
    data.facts,
    'Life Record',
    parseLifeFact,
    (item) => item.lifeFactId,
  );
  const pagination = parsePagination(data.pagination);
  requirePageBound(facts.length, pagination);
  return Object.freeze({ facts, pagination });
}

export async function readReadingHistoryPageV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  options: RecordsPageOptionsV1 = {},
): Promise<ReadingHistoryPageV1> {
  const data = await client.requestData({
    method: 'GET',
    path: pagePath('/api/readings', options),
    bearer,
  });
  if (!isRecord(data)) return malformed('Reading History response is invalid.');
  const readings = parseUniqueItems(
    data.readings,
    'Reading History',
    parseReading,
    (item) => item.readingId,
  );
  const pagination = parsePagination(data.pagination);
  requirePageBound(readings.length, pagination);
  return Object.freeze({ readings, pagination });
}

export async function readMemoryPageV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  options: RecordsPageOptionsV1 = {},
): Promise<MemoryPageV1> {
  const data = await client.requestData({
    method: 'GET',
    path: pagePath('/api/memories', options),
    bearer,
  });
  if (!isRecord(data)) return malformed('Memory response is invalid.');
  const memories = parseUniqueItems(
    data.memories,
    'Memory',
    parseMemory,
    (item) => item.memoryItemId,
  );
  const pagination = parsePagination(data.pagination);
  requirePageBound(memories.length, pagination);
  return Object.freeze({ memories, pagination });
}


export function parseOfficialReadingIdV1(value: unknown): string {
  if (typeof value !== 'string' || !UUID_V1.test(value.trim())) {
    return detailClientInput('Official Reading id must be a canonical UUID.');
  }
  return value.trim();
}

function parseOfficialReadingRecordV1(
  value: unknown,
  expectedReadingId: string,
): OfficialReadingRecordV1 {
  if (!isRecord(value)) return malformed('Official Reading response is invalid.');

  const readingId = requireString('Official Reading identity', value.readingId);
  if (readingId !== expectedReadingId || !UUID_V1.test(readingId)) {
    return malformed('Official Reading identity does not match the request.');
  }

  const readingSessionId = requireString(
    'Official Reading Session identity',
    value.readingSessionId,
  );
  if (!UUID_V1.test(readingSessionId)) {
    return malformed('Official Reading Session identity is invalid.');
  }

  const sajuDomain = requireString('Official Reading sajuDomain', value.sajuDomain);
  if (!SAJU_DOMAINS_V1.has(sajuDomain)) {
    return malformed('Official Reading sajuDomain is invalid.');
  }

  const readingContractVersion = requireString(
    'Official Reading contract version',
    value.readingContractVersion,
  );
  const productResponseState = requireString(
    'Official Reading product response state',
    value.productResponseState,
  );
  if (
    productResponseState !== 'delivered' &&
    productResponseState !== 'delivered_with_fallback'
  ) {
    return malformed('Official Reading is not archive-openable.');
  }

  const display = projectProductReadingResponseV2(
    value.reading,
    'API_RECORDS_RESPONSE_INVALID',
  );
  if (display.kind !== 'delivered') {
    return malformed('Official Reading snapshot is not delivered.');
  }
  if (
    display.readingId !== readingId ||
    display.responseVersion !== readingContractVersion ||
    display.responseState !== productResponseState
  ) {
    return malformed('Official Reading snapshot provenance does not match record metadata.');
  }

  const readerCharacterIds = parseReaderCharacterIds(value.readerCharacterIds);
  const sortedIds = [...readerCharacterIds].sort((left, right) =>
    left.localeCompare(right),
  );
  if (sortedIds.some((item, index) => item !== readerCharacterIds[index])) {
    return malformed('Official Reading reader provenance is not deterministic.');
  }

  return Object.freeze({
    readingId,
    readingSessionId,
    sajuDomain,
    readingContractVersion,
    productResponseState,
    readerCharacterIds,
    completedAt: requireTimestamp('Official Reading completedAt', value.completedAt),
    display,
  });
}

export async function readOfficialReadingRecordV1(
  client: MyeongHaApiClientV1,
  bearer: string,
  readingIdInput: unknown,
): Promise<OfficialReadingRecordV1> {
  const readingId = parseOfficialReadingIdV1(readingIdInput);
  const search = new URLSearchParams({ readingId });
  const data = await client.requestData({
    method: 'GET',
    path: `/api/readings?${search.toString()}`,
    bearer,
  });
  return parseOfficialReadingRecordV1(data, readingId);
}
