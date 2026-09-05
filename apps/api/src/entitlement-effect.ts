export const ENTITLEMENT_EFFECT_SCHEMA_VERSION_V1 =
  'entitlement-effect-v1' as const;

export type EntitlementEventTypeV1 =
  | 'granted'
  | 'renewed'
  | 'expired'
  | 'revoked'
  | 'restored'
  | 'adjusted';

export type EntitlementTargetStatusV1 = 'active' | 'expired' | 'revoked';

export interface EntitlementEffectV1 {
  readonly schemaVersion: typeof ENTITLEMENT_EFFECT_SCHEMA_VERSION_V1;
  readonly eventType: EntitlementEventTypeV1;
  readonly effectiveAt: string;
  readonly targetStatus: EntitlementTargetStatusV1;
  readonly targetValidFrom: string;
  readonly targetValidUntil: string | null;
  readonly reasonCode?: string;
}

const ENTITLEMENT_EFFECT_KEYS_V1 = new Set([
  'schemaVersion',
  'eventType',
  'effectiveAt',
  'targetStatus',
  'targetValidFrom',
  'targetValidUntil',
  'reasonCode',
] as const);

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

function requireNullableNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new Error(`${label} ${key} is required.`);
  }

  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} ${key} must be null or a non-empty string.`);
  }
  return value;
}

function requireEventType(value: unknown): EntitlementEventTypeV1 {
  switch (value) {
    case 'granted':
    case 'renewed':
    case 'expired':
    case 'revoked':
    case 'restored':
    case 'adjusted':
      return value;
    default:
      throw new Error('Entitlement effect eventType is invalid.');
  }
}

function requireTargetStatus(value: unknown): EntitlementTargetStatusV1 {
  switch (value) {
    case 'active':
    case 'expired':
    case 'revoked':
      return value;
    default:
      throw new Error('Entitlement effect targetStatus is invalid.');
  }
}

function requireAuthorizedStaticTransition(
  eventType: EntitlementEventTypeV1,
  targetStatus: EntitlementTargetStatusV1,
  reasonCode: string | undefined,
): void {
  const expectedStatus =
    eventType === 'granted' ||
    eventType === 'renewed' ||
    eventType === 'restored'
      ? 'active'
      : eventType === 'expired'
        ? 'expired'
        : eventType === 'revoked'
          ? 'revoked'
          : null;

  if (expectedStatus !== null && targetStatus !== expectedStatus) {
    throw new Error(
      'Entitlement effect eventType and targetStatus are inconsistent.',
    );
  }

  if (eventType === 'adjusted' && reasonCode === undefined) {
    throw new Error('Adjusted entitlement effect requires reasonCode.');
  }
}

/**
 * Validates only the provider-neutral EntitlementEffectV1 contract authorized
 * by COMMERCE_ENTITLEMENT_ARCHITECTURE_V1 and SRC-21.
 *
 * Timestamp-like fields remain opaque strings here because neither authority
 * assigns this structural boundary a timestamp grammar. This validator also
 * does not decide provider ordering, compare apply-time `as_of`, enforce
 * historical interval preservation, generate event dedupe identities, verify
 * system/admin actors, persist state, or mutate grants/entitlements.
 */
export function requireEntitlementEffectV1(value: unknown): EntitlementEffectV1 {
  const record = requirePlainRecord(value, 'Entitlement effect');
  rejectUnknownKeys(record, ENTITLEMENT_EFFECT_KEYS_V1, 'Entitlement effect');

  if (record.schemaVersion !== ENTITLEMENT_EFFECT_SCHEMA_VERSION_V1) {
    throw new Error('Entitlement effect schemaVersion is invalid.');
  }

  const eventType = requireEventType(record.eventType);
  const effectiveAt = requireNonEmptyString(
    record,
    'effectiveAt',
    'Entitlement effect',
  );
  const targetStatus = requireTargetStatus(record.targetStatus);
  const targetValidFrom = requireNonEmptyString(
    record,
    'targetValidFrom',
    'Entitlement effect',
  );
  const targetValidUntil = requireNullableNonEmptyString(
    record,
    'targetValidUntil',
    'Entitlement effect',
  );
  const reasonCode = optionalNonEmptyString(
    record,
    'reasonCode',
    'Entitlement effect',
  );

  requireAuthorizedStaticTransition(eventType, targetStatus, reasonCode);

  return Object.freeze({
    schemaVersion: ENTITLEMENT_EFFECT_SCHEMA_VERSION_V1,
    eventType,
    effectiveAt,
    targetStatus,
    targetValidFrom,
    targetValidUntil,
    ...(reasonCode === undefined ? {} : { reasonCode }),
  });
}
