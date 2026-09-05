export const VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1 =
  'commerce-evidence-v1' as const;
export const VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V2 =
  'commerce-evidence-v2' as const;

export type VerifiedCommercePlatformV1 = 'web' | 'ios' | 'android';
export type VerifiedCommerceEnvironmentV1 = 'sandbox' | 'production';
export type VerifiedCommerceCurrentStateV1 =
  | 'active'
  | 'expired'
  | 'revoked'
  | 'refunded';

export type VerifiedCommerceOwnerBindingV1 =
  | {
      readonly kind: 'purchase_intent';
      readonly purchaseIntentId: string;
    }
  | {
      readonly kind: 'account_link';
      readonly commerceAccountLinkId: string;
    }
  | {
      readonly kind: 'receipt_lineage';
      readonly commerceReceiptId: string;
    };

export interface VerifiedCommerceEvidenceV1 {
  readonly schemaVersion: typeof VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1;
  readonly provider: string;
  readonly platform: VerifiedCommercePlatformV1;
  readonly environment: VerifiedCommerceEnvironmentV1;
  readonly externalTransactionId: string;
  readonly externalOriginalTransactionId?: string;
  readonly externalEventId?: string;
  readonly externalProductId: string;
  readonly providerOccurredAt?: string;
  readonly providerOrderingKey?: string;
  readonly currentState: VerifiedCommerceCurrentStateV1;
  readonly providerValidUntil?: string;
  readonly ownerBinding: VerifiedCommerceOwnerBindingV1;
  readonly evidenceFingerprint: string;
  readonly verifierRevision: string;
}

export type VerifiedCommercePlatformV2 = VerifiedCommercePlatformV1;
export type VerifiedCommerceEnvironmentV2 = VerifiedCommerceEnvironmentV1;
export type VerifiedCommerceCurrentStateV2 = VerifiedCommerceCurrentStateV1;
export type VerifiedCommerceOwnerBindingV2 = VerifiedCommerceOwnerBindingV1;

/**
 * Additive provider-neutral evidence contract aligned with the payment-source
 * authority introduced by migration 0930.
 *
 * Provider-native time/order tokens intentionally remain opaque here. Their
 * semantics belong to the selected provider adapter. `verifiedAt` is different:
 * it is MyeongHa server verification provenance, so v2 requires a canonical UTC
 * millisecond timestamp.
 */
export interface VerifiedCommerceEvidenceV2 {
  readonly schemaVersion: typeof VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V2;
  readonly provider: string;
  readonly platform: VerifiedCommercePlatformV2;
  readonly environment: VerifiedCommerceEnvironmentV2;
  readonly externalTransactionId: string;
  readonly externalOriginalTransactionId?: string;
  readonly externalEventId?: string;
  readonly externalProductId: string;
  readonly providerOccurredAt?: string;
  readonly providerOrderingKey?: string;
  readonly currentState: VerifiedCommerceCurrentStateV2;
  readonly providerValidUntil?: string;
  readonly ownerBinding: VerifiedCommerceOwnerBindingV2;
  readonly evidenceFingerprint: string;
  readonly verifierRevision: string;
  readonly verifiedAmountMinor: number;
  readonly verifiedCurrency: string;
  readonly verifiedAt: string;
}

const VERIFIED_COMMERCE_EVIDENCE_KEYS_V1 = new Set([
  'schemaVersion',
  'provider',
  'platform',
  'environment',
  'externalTransactionId',
  'externalOriginalTransactionId',
  'externalEventId',
  'externalProductId',
  'providerOccurredAt',
  'providerOrderingKey',
  'currentState',
  'providerValidUntil',
  'ownerBinding',
  'evidenceFingerprint',
  'verifierRevision',
] as const);

const VERIFIED_COMMERCE_EVIDENCE_KEYS_V2 = new Set([
  ...VERIFIED_COMMERCE_EVIDENCE_KEYS_V1,
  'verifiedAmountMinor',
  'verifiedCurrency',
  'verifiedAt',
] as const);

const COMMERCE_EVIDENCE_FINGERPRINT_V1 =
  /^hmac-sha256:k1:[0-9a-f]{64}$/u;
const COMMERCE_CURRENCY_V2 = /^[A-Z]{3}$/u;
const CANONICAL_UTC_MILLISECOND_TIMESTAMP_V2 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function requirePlainRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object.`);
  }

  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) {
      throw new Error(`${label} contains unsupported fields.`);
    }
  }
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} ${key} must be a non-empty string.`);
  }
  return value;
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  return requireNonEmptyString(record, key, label);
}

function requirePlatform(value: unknown): VerifiedCommercePlatformV1 {
  switch (value) {
    case 'web':
    case 'ios':
    case 'android':
      return value;
    default:
      throw new Error('Verified Commerce evidence platform is invalid.');
  }
}

function requireEnvironment(value: unknown): VerifiedCommerceEnvironmentV1 {
  switch (value) {
    case 'sandbox':
    case 'production':
      return value;
    default:
      throw new Error('Verified Commerce evidence environment is invalid.');
  }
}

function requireCurrentState(value: unknown): VerifiedCommerceCurrentStateV1 {
  switch (value) {
    case 'active':
    case 'expired':
    case 'revoked':
    case 'refunded':
      return value;
    default:
      throw new Error('Verified Commerce evidence currentState is invalid.');
  }
}

function requireOwnerBinding(value: unknown): VerifiedCommerceOwnerBindingV1 {
  const record = requirePlainRecord(value, 'Verified Commerce ownerBinding');
  const kind = requireNonEmptyString(
    record,
    'kind',
    'Verified Commerce ownerBinding',
  );

  switch (kind) {
    case 'purchase_intent': {
      rejectUnknownKeys(
        record,
        new Set(['kind', 'purchaseIntentId']),
        'Verified Commerce ownerBinding',
      );
      const purchaseIntentId = requireNonEmptyString(
        record,
        'purchaseIntentId',
        'Verified Commerce ownerBinding',
      );
      return Object.freeze({ kind, purchaseIntentId });
    }
    case 'account_link': {
      rejectUnknownKeys(
        record,
        new Set(['kind', 'commerceAccountLinkId']),
        'Verified Commerce ownerBinding',
      );
      const commerceAccountLinkId = requireNonEmptyString(
        record,
        'commerceAccountLinkId',
        'Verified Commerce ownerBinding',
      );
      return Object.freeze({ kind, commerceAccountLinkId });
    }
    case 'receipt_lineage': {
      rejectUnknownKeys(
        record,
        new Set(['kind', 'commerceReceiptId']),
        'Verified Commerce ownerBinding',
      );
      const commerceReceiptId = requireNonEmptyString(
        record,
        'commerceReceiptId',
        'Verified Commerce ownerBinding',
      );
      return Object.freeze({ kind, commerceReceiptId });
    }
    default:
      throw new Error('Verified Commerce ownerBinding kind is invalid.');
  }
}

function requireEvidenceFingerprint(record: Record<string, unknown>): string {
  const evidenceFingerprint = requireNonEmptyString(
    record,
    'evidenceFingerprint',
    'Verified Commerce evidence',
  );
  if (!COMMERCE_EVIDENCE_FINGERPRINT_V1.test(evidenceFingerprint)) {
    throw new Error('Verified Commerce evidence fingerprint is invalid.');
  }
  return evidenceFingerprint;
}

function requirePositiveSafeInteger(
  record: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = record[key];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${label} ${key} must be a positive safe integer.`);
  }
  return value;
}

function requireCurrencyV2(record: Record<string, unknown>): string {
  const currency = requireNonEmptyString(
    record,
    'verifiedCurrency',
    'Verified Commerce evidence',
  );
  if (!COMMERCE_CURRENCY_V2.test(currency)) {
    throw new Error(
      'Verified Commerce evidence verifiedCurrency must be exactly three uppercase ASCII letters.',
    );
  }
  return currency;
}

function requireCanonicalUtcTimestampV2(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = requireNonEmptyString(record, key, 'Verified Commerce evidence');
  if (!CANONICAL_UTC_MILLISECOND_TIMESTAMP_V2.test(value)) {
    throw new Error(
      `Verified Commerce evidence ${key} must be a canonical UTC millisecond timestamp.`,
    );
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(
      `Verified Commerce evidence ${key} must be a canonical UTC millisecond timestamp.`,
    );
  }
  return value;
}

/**
 * Validates only the provider-neutral Commerce evidence contract authorized by
 * COMMERCE_ENTITLEMENT_ARCHITECTURE_V1 and P0-PR-01B.
 *
 * This boundary deliberately does not parse provider payloads, infer ordering,
 * verify payment authenticity, bind production credentials, persist evidence,
 * or mutate entitlement state. Provider-specific adapters must first verify and
 * normalize their facts before calling this validator.
 */
export function requireVerifiedCommerceEvidenceV1(
  value: unknown,
): VerifiedCommerceEvidenceV1 {
  const record = requirePlainRecord(value, 'Verified Commerce evidence');
  rejectUnknownKeys(
    record,
    VERIFIED_COMMERCE_EVIDENCE_KEYS_V1,
    'Verified Commerce evidence',
  );

  if (record.schemaVersion !== VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1) {
    throw new Error('Verified Commerce evidence schemaVersion is invalid.');
  }

  const provider = requireNonEmptyString(
    record,
    'provider',
    'Verified Commerce evidence',
  );
  const platform = requirePlatform(record.platform);
  const environment = requireEnvironment(record.environment);
  const externalTransactionId = requireNonEmptyString(
    record,
    'externalTransactionId',
    'Verified Commerce evidence',
  );
  const externalOriginalTransactionId = optionalNonEmptyString(
    record,
    'externalOriginalTransactionId',
    'Verified Commerce evidence',
  );
  const externalEventId = optionalNonEmptyString(
    record,
    'externalEventId',
    'Verified Commerce evidence',
  );
  const externalProductId = requireNonEmptyString(
    record,
    'externalProductId',
    'Verified Commerce evidence',
  );
  const providerOccurredAt = optionalNonEmptyString(
    record,
    'providerOccurredAt',
    'Verified Commerce evidence',
  );
  const providerOrderingKey = optionalNonEmptyString(
    record,
    'providerOrderingKey',
    'Verified Commerce evidence',
  );
  const currentState = requireCurrentState(record.currentState);
  const providerValidUntil = optionalNonEmptyString(
    record,
    'providerValidUntil',
    'Verified Commerce evidence',
  );
  const ownerBinding = requireOwnerBinding(record.ownerBinding);
  const evidenceFingerprint = requireEvidenceFingerprint(record);
  const verifierRevision = requireNonEmptyString(
    record,
    'verifierRevision',
    'Verified Commerce evidence',
  );

  return Object.freeze({
    schemaVersion: VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1,
    provider,
    platform,
    environment,
    externalTransactionId,
    ...(externalOriginalTransactionId === undefined
      ? {}
      : { externalOriginalTransactionId }),
    ...(externalEventId === undefined ? {} : { externalEventId }),
    externalProductId,
    ...(providerOccurredAt === undefined ? {} : { providerOccurredAt }),
    ...(providerOrderingKey === undefined ? {} : { providerOrderingKey }),
    currentState,
    ...(providerValidUntil === undefined ? {} : { providerValidUntil }),
    ownerBinding,
    evidenceFingerprint,
    verifierRevision,
  });
}

/**
 * Validates the additive v2 provider-neutral evidence contract.
 *
 * V2 aligns the normalized fact with DB payment-source authority by requiring
 * exact verified money terms and server verification time. It still does not
 * verify provider authenticity, decide provider ordering, persist evidence,
 * apply grants, or permit sandbox evidence to mutate production rights.
 */
export function requireVerifiedCommerceEvidenceV2(
  value: unknown,
): VerifiedCommerceEvidenceV2 {
  const record = requirePlainRecord(value, 'Verified Commerce evidence');
  rejectUnknownKeys(
    record,
    VERIFIED_COMMERCE_EVIDENCE_KEYS_V2,
    'Verified Commerce evidence',
  );

  if (record.schemaVersion !== VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V2) {
    throw new Error('Verified Commerce evidence schemaVersion is invalid.');
  }

  const provider = requireNonEmptyString(
    record,
    'provider',
    'Verified Commerce evidence',
  );
  const platform = requirePlatform(record.platform);
  const environment = requireEnvironment(record.environment);
  const externalTransactionId = requireNonEmptyString(
    record,
    'externalTransactionId',
    'Verified Commerce evidence',
  );
  const externalOriginalTransactionId = optionalNonEmptyString(
    record,
    'externalOriginalTransactionId',
    'Verified Commerce evidence',
  );
  const externalEventId = optionalNonEmptyString(
    record,
    'externalEventId',
    'Verified Commerce evidence',
  );
  const externalProductId = requireNonEmptyString(
    record,
    'externalProductId',
    'Verified Commerce evidence',
  );
  const providerOccurredAt = optionalNonEmptyString(
    record,
    'providerOccurredAt',
    'Verified Commerce evidence',
  );
  const providerOrderingKey = optionalNonEmptyString(
    record,
    'providerOrderingKey',
    'Verified Commerce evidence',
  );
  const currentState = requireCurrentState(record.currentState);
  const providerValidUntil = optionalNonEmptyString(
    record,
    'providerValidUntil',
    'Verified Commerce evidence',
  );
  const ownerBinding = requireOwnerBinding(record.ownerBinding);
  const evidenceFingerprint = requireEvidenceFingerprint(record);
  const verifierRevision = requireNonEmptyString(
    record,
    'verifierRevision',
    'Verified Commerce evidence',
  );
  const verifiedAmountMinor = requirePositiveSafeInteger(
    record,
    'verifiedAmountMinor',
    'Verified Commerce evidence',
  );
  const verifiedCurrency = requireCurrencyV2(record);
  const verifiedAt = requireCanonicalUtcTimestampV2(record, 'verifiedAt');

  return Object.freeze({
    schemaVersion: VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V2,
    provider,
    platform,
    environment,
    externalTransactionId,
    ...(externalOriginalTransactionId === undefined
      ? {}
      : { externalOriginalTransactionId }),
    ...(externalEventId === undefined ? {} : { externalEventId }),
    externalProductId,
    ...(providerOccurredAt === undefined ? {} : { providerOccurredAt }),
    ...(providerOrderingKey === undefined ? {} : { providerOrderingKey }),
    currentState,
    ...(providerValidUntil === undefined ? {} : { providerValidUntil }),
    ownerBinding,
    evidenceFingerprint,
    verifierRevision,
    verifiedAmountMinor,
    verifiedCurrency,
    verifiedAt,
  });
}
