import { describe, expect, it } from 'vitest';
import {
  VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1,
  requireVerifiedCommerceEvidenceV1,
} from '../apps/api/src/verified-commerce-evidence.js';

const FINGERPRINT = `hmac-sha256:k1:${'a'.repeat(64)}`;

function validEvidence(): Record<string, unknown> {
  return {
    schemaVersion: VERIFIED_COMMERCE_EVIDENCE_SCHEMA_VERSION_V1,
    provider: 'test-provider',
    platform: 'web',
    environment: 'sandbox',
    externalTransactionId: 'txn_123',
    externalProductId: 'product_abc',
    currentState: 'active',
    ownerBinding: {
      kind: 'purchase_intent',
      purchaseIntentId: 'pi_123',
    },
    evidenceFingerprint: FINGERPRINT,
    verifierRevision: 'test-verifier-v1',
  };
}

describe('VerifiedCommerceEvidenceV1 structural contract', () => {
  it('accepts the minimal provider-neutral evidence shape and returns a frozen copy', () => {
    const input = validEvidence();
    const result = requireVerifiedCommerceEvidenceV1(input);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ownerBinding)).toBe(true);
  });

  it('accepts all Architecture-authorized optional evidence fields without interpreting them', () => {
    const result = requireVerifiedCommerceEvidenceV1({
      ...validEvidence(),
      platform: 'ios',
      environment: 'production',
      externalOriginalTransactionId: 'original_123',
      externalEventId: 'event_123',
      providerOccurredAt: 'provider-time-token',
      providerOrderingKey: 'provider-order-token',
      currentState: 'refunded',
      providerValidUntil: 'provider-valid-until-token',
    });

    expect(result.externalOriginalTransactionId).toBe('original_123');
    expect(result.externalEventId).toBe('event_123');
    expect(result.providerOccurredAt).toBe('provider-time-token');
    expect(result.providerOrderingKey).toBe('provider-order-token');
    expect(result.providerValidUntil).toBe('provider-valid-until-token');
  });

  it('accepts each server-resolved ownerBinding variant', () => {
    const variants = [
      {
        kind: 'purchase_intent',
        purchaseIntentId: 'pi_123',
      },
      {
        kind: 'account_link',
        commerceAccountLinkId: 'link_123',
      },
      {
        kind: 'receipt_lineage',
        commerceReceiptId: 'receipt_123',
      },
    ] as const;

    for (const ownerBinding of variants) {
      expect(
        requireVerifiedCommerceEvidenceV1({
          ...validEvidence(),
          ownerBinding,
        }).ownerBinding,
      ).toEqual(ownerBinding);
    }
  });

  it.each([
    ['schemaVersion', 'commerce-evidence-v2'],
    ['platform', 'desktop'],
    ['environment', 'staging'],
    ['currentState', 'pending'],
  ])('fails closed on unsupported %s vocabulary', (field, value) => {
    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        [field]: value,
      }),
    ).toThrow();
  });

  it.each([
    'provider',
    'externalTransactionId',
    'externalProductId',
    'evidenceFingerprint',
    'verifierRevision',
  ])('fails closed when required %s is empty', (field) => {
    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        [field]: '   ',
      }),
    ).toThrow('non-empty string');
  });

  it.each([
    'externalOriginalTransactionId',
    'externalEventId',
    'providerOccurredAt',
    'providerOrderingKey',
    'providerValidUntil',
  ])('rejects an optional %s field when present but empty or non-string', (field) => {
    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        [field]: '',
      }),
    ).toThrow('non-empty string');
    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        [field]: 123,
      }),
    ).toThrow('non-empty string');
  });

  it('rejects unsupported top-level fields instead of carrying raw or client authority through', () => {
    for (const extraField of ['subjectId', 'userId', 'rawReceipt', 'authorization']) {
      expect(() =>
        requireVerifiedCommerceEvidenceV1({
          ...validEvidence(),
          [extraField]: 'sensitive-or-untrusted-value',
        }),
      ).toThrow('unsupported fields');
    }
  });

  it('rejects symbol-key and non-plain-object evidence inputs', () => {
    const withSymbol = validEvidence();
    Object.defineProperty(withSymbol, Symbol('raw-provider-object'), {
      value: 'hidden',
      enumerable: false,
    });

    expect(() => requireVerifiedCommerceEvidenceV1(withSymbol)).toThrow(
      'unsupported fields',
    );
    expect(() => requireVerifiedCommerceEvidenceV1([])).toThrow('must be an object');
    expect(() => requireVerifiedCommerceEvidenceV1(new Date())).toThrow(
      'plain object',
    );
  });

  it('rejects unsupported, ambiguous, or widened ownerBinding shapes', () => {
    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        ownerBinding: {
          kind: 'subject',
          subjectId: 'subject_123',
        },
      }),
    ).toThrow('kind is invalid');

    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        ownerBinding: {
          kind: 'purchase_intent',
          purchaseIntentId: 'pi_123',
          commerceAccountLinkId: 'link_123',
        },
      }),
    ).toThrow('unsupported fields');

    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        ownerBinding: {
          kind: 'receipt_lineage',
          commerceReceiptId: '',
        },
      }),
    ).toThrow('non-empty string');
  });

  it.each([
    'sha256:k1:' + 'a'.repeat(64),
    'hmac-sha256:k2:' + 'a'.repeat(64),
    'hmac-sha256:k1:' + 'A'.repeat(64),
    'hmac-sha256:k1:' + 'a'.repeat(63),
    'hmac-sha256:k1:' + 'g'.repeat(64),
  ])('rejects malformed or unapproved evidence fingerprint %s', (fingerprint) => {
    expect(() =>
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        evidenceFingerprint: fingerprint,
      }),
    ).toThrow('fingerprint is invalid');
  });

  it('does not include rejected raw evidence values in validation errors', () => {
    const rawReceipt = 'raw-secret-receipt-value';

    try {
      requireVerifiedCommerceEvidenceV1({
        ...validEvidence(),
        rawReceipt,
      });
      throw new Error('expected validation to fail');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(rawReceipt);
    }
  });
});
