export const VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1 =
  'commerce-evidence-v1' as const;

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

const COMMERCE_EVIDENCE_FINGERPRINT_V1 =
  /^hmac-sha256:k1:[0-9a-f]{64}$/u;

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
  const evidenceFingerprint = requireNonEmptyString(
    record,
    'evidenceFingerprint',
    'Verified Commerce evidence',
  );
  if (!COMMERCE_EVIDENCE_FINGERPRINT_V1.test(evidenceFingerprint)) {
    throw new Error('Verified Commerce evidence fingerprint is invalid.');
  }
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
