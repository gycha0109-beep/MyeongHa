import { describe, expect, it } from 'vitest';
import {
  ENTITLEMENT_EFFECT_SCHEMA_VERSION_V1,
  requireEntitlementEffectV1,
} from '../apps/api/src/entitlement-effect.js';

function validEffect(): Record<string, unknown> {
  return {
    schemaVersion: ENTITLEMENT_EFFECT_SCHEMA_VERSION_V1,
    eventType: 'granted',
    effectiveAt: 'effect-time-token',
    targetStatus: 'active',
    targetValidFrom: 'valid-from-token',
    targetValidUntil: null,
  };
}

describe('EntitlementEffectV1 structural contract', () => {
  it('accepts the minimal provider-neutral effect shape and returns a frozen copy', () => {
    const input = validEffect();
    const result = requireEntitlementEffectV1(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('accepts finite validity and an optional reason without inventing timestamp grammar', () => {
    const result = requireEntitlementEffectV1({
      ...validEffect(),
      effectiveAt: 'opaque-effective-at',
      targetValidFrom: 'opaque-valid-from',
      targetValidUntil: 'opaque-valid-until',
      reasonCode: 'provider_reinstated',
    });

    expect(result.effectiveAt).toBe('opaque-effective-at');
    expect(result.targetValidFrom).toBe('opaque-valid-from');
    expect(result.targetValidUntil).toBe('opaque-valid-until');
    expect(result.reasonCode).toBe('provider_reinstated');
  });

  it.each([
    ['granted', 'active'],
    ['renewed', 'active'],
    ['expired', 'expired'],
    ['revoked', 'revoked'],
    ['restored', 'active'],
  ] as const)(
    'accepts the Architecture-authorized static transition %s -> %s',
    (eventType, targetStatus) => {
      expect(
        requireEntitlementEffectV1({
          ...validEffect(),
          eventType,
          targetStatus,
        }),
      ).toMatchObject({ eventType, targetStatus });
    },
  );

  it.each(['active', 'expired', 'revoked'] as const)(
    'accepts adjusted -> %s only when a reason is present',
    (targetStatus) => {
      expect(
        requireEntitlementEffectV1({
          ...validEffect(),
          eventType: 'adjusted',
          targetStatus,
          reasonCode: 'support_correction',
        }),
      ).toMatchObject({
        eventType: 'adjusted',
        targetStatus,
        reasonCode: 'support_correction',
      });
    },
  );

  it.each([
    ['schemaVersion', 'entitlement-effect-v2'],
    ['eventType', 'refunded'],
    ['targetStatus', 'inactive'],
  ])('fails closed on unsupported %s vocabulary', (field, value) => {
    expect(() =>
      requireEntitlementEffectV1({
        ...validEffect(),
        [field]: value,
      }),
    ).toThrow();
  });

  it.each(['effectiveAt', 'targetValidFrom'])(
    'fails closed when required %s is empty or non-string',
    (field) => {
      expect(() =>
        requireEntitlementEffectV1({
          ...validEffect(),
          [field]: '   ',
        }),
      ).toThrow('non-empty string');
      expect(() =>
        requireEntitlementEffectV1({
          ...validEffect(),
          [field]: 123,
        }),
      ).toThrow('non-empty string');
    },
  );

  it('requires targetValidUntil explicitly and accepts only null or a non-empty string', () => {
    const omitted = validEffect();
    delete omitted.targetValidUntil;

    expect(() => requireEntitlementEffectV1(omitted)).toThrow('is required');
    expect(() =>
      requireEntitlementEffectV1({
        ...validEffect(),
        targetValidUntil: '',
      }),
    ).toThrow('null or a non-empty string');
    expect(() =>
      requireEntitlementEffectV1({
        ...validEffect(),
        targetValidUntil: 123,
      }),
    ).toThrow('null or a non-empty string');
  });

  it('rejects an optional reasonCode when present but empty or non-string', () => {
    expect(() =>
      requireEntitlementEffectV1({
        ...validEffect(),
        reasonCode: '',
      }),
    ).toThrow('non-empty string');
    expect(() =>
      requireEntitlementEffectV1({
        ...validEffect(),
        reasonCode: 123,
      }),
    ).toThrow('non-empty string');
  });

  it.each([
    ['granted', 'expired'],
    ['renewed', 'revoked'],
    ['expired', 'active'],
    ['revoked', 'active'],
    ['restored', 'expired'],
  ] as const)(
    'rejects Architecture-inconsistent static transition %s -> %s',
    (eventType, targetStatus) => {
      expect(() =>
        requireEntitlementEffectV1({
          ...validEffect(),
          eventType,
          targetStatus,
        }),
      ).toThrow('inconsistent');
    },
  );

  it('requires reasonCode for adjusted effects', () => {
    expect(() =>
      requireEntitlementEffectV1({
        ...validEffect(),
        eventType: 'adjusted',
        targetStatus: 'active',
      }),
    ).toThrow('requires reasonCode');
  });

  it('rejects unsupported fields instead of carrying source, actor, dedupe, or raw provider authority through', () => {
    for (const extraField of [
      'sourceId',
      'actorId',
      'eventDedupeKey',
      'providerOrderingKey',
      'rawProviderPayload',
    ]) {
      expect(() =>
        requireEntitlementEffectV1({
          ...validEffect(),
          [extraField]: 'untrusted-or-separate-authority',
        }),
      ).toThrow('unsupported fields');
    }
  });

  it('rejects symbol-key and non-plain-object effect inputs', () => {
    const withSymbol = validEffect();
    Object.defineProperty(withSymbol, Symbol('hidden-source'), {
      value: 'hidden',
      enumerable: false,
    });

    expect(() => requireEntitlementEffectV1(withSymbol)).toThrow(
      'unsupported fields',
    );
    expect(() => requireEntitlementEffectV1([])).toThrow('must be an object');
    expect(() => requireEntitlementEffectV1(new Date())).toThrow('plain object');
  });

  it('does not include rejected raw values in validation errors', () => {
    const rawProviderPayload = 'raw-secret-provider-value';
    let thrown: unknown;

    try {
      requireEntitlementEffectV1({
        ...validEffect(),
        rawProviderPayload,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(message).not.toContain(rawProviderPayload);
  });
});
