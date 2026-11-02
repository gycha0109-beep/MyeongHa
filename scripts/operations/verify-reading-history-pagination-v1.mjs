// Read-only production Reading History pagination shape contract.
// Never decode or log an opaque cursor: it can encode subject-bound state.
const CURSOR_FORMAT = /^[A-Za-z0-9_-]+$/u;
const DEFAULT_PAGE_SIZE = 50;

function requireExactKeys(name, value, keys) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(name + ' must be an object.');
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(name + ' returned an unexpected field set: ' + actual.join(',') + '.');
  }
}

export function validateProductionReadingHistoryPageV1(data) {
  requireExactKeys('Production Reading History data', data, ['readings', 'pagination']);
  if (!Array.isArray(data.readings)) {
    throw new Error('Production Reading History readings must be an array.');
  }
  const pagination = data.pagination;
  requireExactKeys('Production Reading History pagination', pagination,
    ['pageSize', 'hasMore', 'nextCursor']);
  // The production smoke requests the default first page with no query string.
  if (!Number.isSafeInteger(pagination.pageSize) || pagination.pageSize !== DEFAULT_PAGE_SIZE) {
    throw new Error('Production Reading History default page size must be 50.');
  }
  if (data.readings.length > pagination.pageSize) {
    throw new Error('Production Reading History returned more items than its page size.');
  }
  if (typeof pagination.hasMore !== 'boolean') {
    throw new Error('Production Reading History hasMore must be boolean.');
  }
  if (pagination.hasMore) {
    if (data.readings.length === 0) {
      throw new Error('Production Reading History cannot advertise more results from an empty page.');
    }
    if (typeof pagination.nextCursor !== 'string' ||
      pagination.nextCursor.length === 0 ||
      pagination.nextCursor.length > 2048 ||
      !CURSOR_FORMAT.test(pagination.nextCursor)) {
      throw new Error('Production Reading History next cursor must be an opaque URL-safe token.');
    }
  } else if (pagination.nextCursor !== null) {
    throw new Error('Production Reading History final page must have a null next cursor.');
  }
  return data.readings;
}
