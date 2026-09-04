import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1,
  fingerprintProductionCommerceEvidenceV1,
  requireProductionCommerceEvidenceFingerprintDomainV1,
  requireProductionCommerceEvidenceHmacK1SecretV1,
  type ProductionCommerceEvidenceFingerprintDomainV1,
} from '../apps/api/src/production-commerce-evidence-fingerprint.js';

const SECRET = 'test-commerce-evidence-hmac-k1-secret-0123456789abcdef';
const CANONICAL_EVIDENCE = Buffer.from('provider:v1:txn_123', 'utf8');

const DOMAINS = PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.domains;

describe('Production Commerce evidence fingerprint V1', () => {
  it('pins the dedicated server-only binding and approved domains', () => {
    expect(PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1).toEqual({
      scheme: 'hmac-sha256',
      keyVersion: 'k1',
      secretEnvName: 'MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET',
      minimumSecretBytes: 32,
      domains: {
        receiptEvidence: 'myeongha.commerce.receipt-evidence.v1',
        providerEventPayload: 'myeongha.commerce.provider-event-payload.v1',
        providerAccount: 'myeongha.commerce.provider-account.v1',
      },
    });
  });

  it('pins exact HMAC-SHA-256 vectors for all Commerce evidence domains', () => {
    expect(
      fingerprintProductionCommerceEvidenceV1({
        domain: DOMAINS.receiptEvidence,
        canonicalEvidenceBytes: CANONICAL_EVIDENCE,
        secret: SECRET,
      }),
    ).toBe(
      'hmac-sha256:k1:fb3b71acdf645f92443db001babf1b9695238bbda2a03f76ce7932c65f65b1e9',
    );
    expect(
      fingerprintProductionCommerceEvidenceV1({
        domain: DOMAINS.providerEventPayload,
        canonicalEvidenceBytes: CANONICAL_EVIDENCE,
        secret: SECRET,
      }),
    ).toBe(
      'hmac-sha256:k1:edab07c970b01688d360513ec0b8f7f38c60f1cc064c455ddc9500fd38539f4a',
    );
    expect(
      fingerprintProductionCommerceEvidenceV1({
        domain: DOMAINS.providerAccount,
        canonicalEvidenceBytes: CANONICAL_EVIDENCE,
        secret: SECRET,
      }),
    ).toBe(
      'hmac-sha256:k1:90cdea34bf4df0b8fecc9133d8b7872d375ca62c9945eecb760287043e3fb8c4',
    );
  });

  it('is deterministic for replay and separates domains', () => {
    const receiptOne = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.receiptEvidence,
      canonicalEvidenceBytes: CANONICAL_EVIDENCE,
      secret: SECRET,
    });
    const receiptReplay = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.receiptEvidence,
      canonicalEvidenceBytes: Buffer.from(CANONICAL_EVIDENCE),
      secret: SECRET,
    });
    const providerEvent = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.providerEventPayload,
      canonicalEvidenceBytes: CANONICAL_EVIDENCE,
      secret: SECRET,
    });
    const providerAccount = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.providerAccount,
      canonicalEvidenceBytes: CANONICAL_EVIDENCE,
      secret: SECRET,
    });

    expect(receiptReplay).toBe(receiptOne);
    expect(new Set([receiptOne, providerEvent, providerAccount]).size).toBe(3);
  });

  it('changes the fingerprint when canonical evidence changes by one byte', () => {
    const original = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.receiptEvidence,
      canonicalEvidenceBytes: CANONICAL_EVIDENCE,
      secret: SECRET,
    });
    const changedBytes = Buffer.from(CANONICAL_EVIDENCE);
    changedBytes[changedBytes.length - 1] ^= 0x01;
    const changed = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.receiptEvidence,
      canonicalEvidenceBytes: changedBytes,
      secret: SECRET,
    });

    expect(changed).not.toBe(original);
  });

  it('stores only the versioned fingerprint, not raw evidence or the secret', () => {
    const fingerprint = fingerprintProductionCommerceEvidenceV1({
      domain: DOMAINS.receiptEvidence,
      canonicalEvidenceBytes: CANONICAL_EVIDENCE,
      secret: SECRET,
    });

    expect(fingerprint).toMatch(/^hmac-sha256:k1:[0-9a-f]{64}$/u);
    expect(fingerprint).not.toContain('provider:v1:txn_123');
    expect(fingerprint).not.toContain(SECRET);
  });

  it('fails closed on missing or undersized secrets using UTF-8 byte length', () => {
    expect(() => requireProductionCommerceEvidenceHmacK1SecretV1(undefined)).toThrow(
      'missing or too short',
    );
    expect(() => requireProductionCommerceEvidenceHmacK1SecretV1('x'.repeat(31))).toThrow(
      'missing or too short',
    );
    expect(() => requireProductionCommerceEvidenceHmacK1SecretV1('가'.repeat(10))).toThrow(
      'missing or too short',
    );
    expect(requireProductionCommerceEvidenceHmacK1SecretV1('x'.repeat(32))).toBe(
      'x'.repeat(32),
    );
    expect(requireProductionCommerceEvidenceHmacK1SecretV1('가'.repeat(11))).toBe(
      '가'.repeat(11),
    );
  });

  it('fails closed on unsupported domains or non-byte canonical evidence', () => {
    expect(() => requireProductionCommerceEvidenceFingerprintDomainV1('other')).toThrow(
      'Unsupported',
    );
    expect(() =>
      fingerprintProductionCommerceEvidenceV1({
        domain: 'myeongha.commerce.other.v1' as ProductionCommerceEvidenceFingerprintDomainV1,
        canonicalEvidenceBytes: CANONICAL_EVIDENCE,
        secret: SECRET,
      }),
    ).toThrow('Unsupported');
    expect(() =>
      fingerprintProductionCommerceEvidenceV1({
        domain: DOMAINS.receiptEvidence,
        canonicalEvidenceBytes: 'not-bytes' as unknown as Uint8Array,
        secret: SECRET,
      }),
    ).toThrow('must be bytes');
  });

  it('does not reuse Birth or Guest fingerprint domains or secret bindings', () => {
    const serialized = JSON.stringify(
      PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1,
    );
    expect(serialized).not.toContain('birth-input');
    expect(serialized).not.toContain('BIRTH_INPUT');
    expect(serialized).not.toContain('guest');
    expect(serialized).not.toContain('GUEST');
  });
});
