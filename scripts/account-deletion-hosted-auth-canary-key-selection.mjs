export class HostedAuthCanaryKeySelectionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'HostedAuthCanaryKeySelectionError';
    this.code = code;
  }
}

function fail(code) {
  throw new HostedAuthCanaryKeySelectionError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function usableApiKey(entry) {
  if (!isRecord(entry)) return null;
  if (
    typeof entry.api_key !== 'string' ||
    entry.api_key.length < 32 ||
    entry.api_key.length > 4_096 ||
    /\s/u.test(entry.api_key)
  ) {
    return null;
  }
  return entry.api_key;
}

function requireUnique(entries, code) {
  if (entries.length !== 1) fail(code);
  return entries[0];
}

export function selectHostedAuthCanaryAdminKey(payload) {
  if (!Array.isArray(payload)) fail('MANAGEMENT_API_SCHEMA_INVALID');

  const modern = payload.filter(
    (entry) =>
      isRecord(entry) &&
      entry.type === 'secret' &&
      typeof entry.api_key === 'string' &&
      entry.api_key.startsWith('sb_secret_') &&
      usableApiKey(entry) !== null,
  );

  const namedDefault = modern.filter((entry) => entry.name === 'default');
  if (namedDefault.length === 1) {
    return usableApiKey(namedDefault[0]);
  }
  if (namedDefault.length > 1) {
    fail('MANAGEMENT_API_SECRET_KEY_AMBIGUOUS');
  }
  if (modern.length === 1) {
    return usableApiKey(modern[0]);
  }
  if (modern.length > 1) {
    fail('MANAGEMENT_API_SECRET_KEY_AMBIGUOUS');
  }

  const legacyServiceRole = payload.filter(
    (entry) =>
      isRecord(entry) &&
      entry.type === 'legacy' &&
      entry.name === 'service_role' &&
      usableApiKey(entry) !== null,
  );
  return usableApiKey(
    requireUnique(
      legacyServiceRole,
      legacyServiceRole.length === 0
        ? 'MANAGEMENT_API_ADMIN_KEY_NOT_FOUND'
        : 'MANAGEMENT_API_LEGACY_KEY_AMBIGUOUS',
    ),
  );
}
