import { createHmac } from 'node:crypto';

export const PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1 = Object.freeze({
  scheme: 'hmac-sha256',
  keyVersion: 'k1',
  secretEnvName: 'MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET',
  minimumSecretBytes: 32,
  domains: Object.freeze({
    receiptEvidence: 'myeongha.commerce.receipt-evidence.v1',
    providerEventPayload: 'myeongha.commerce.provider-event-payload.v1',
    providerAccount: 'myeongha.commerce.provider-account.v1',
  }),
} as const);

export type ProductionCommerceEvidenceFingerprintDomainV1 =
  (typeof PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.domains)[keyof typeof PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.domains];

export function requireProductionCommerceEvidenceFingerprintDomainV1(
  value: unknown,
): ProductionCommerceEvidenceFingerprintDomainV1 {
  const { domains } = PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1;
  if (
    value !== domains.receiptEvidence &&
    value !== domains.providerEventPayload &&
    value !== domains.providerAccount
  ) {
    throw new Error('Unsupported Production Commerce evidence fingerprint domain.');
  }
  return value;
}

export function requireProductionCommerceEvidenceHmacK1SecretV1(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') <
      PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.minimumSecretBytes
  ) {
    throw new Error(
      'Production Commerce evidence HMAC k1 secret is missing or too short.',
    );
  }
  return value;
}

export function fingerprintProductionCommerceEvidenceV1(input: {
  readonly domain: ProductionCommerceEvidenceFingerprintDomainV1;
  readonly canonicalEvidenceBytes: Uint8Array;
  readonly secret: string;
}): string {
  const domain = requireProductionCommerceEvidenceFingerprintDomainV1(input.domain);
  if (!(input.canonicalEvidenceBytes instanceof Uint8Array)) {
    throw new Error('Production Commerce canonical evidence must be bytes.');
  }
  const secret = requireProductionCommerceEvidenceHmacK1SecretV1(input.secret);
  const binding = PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1;

  const digest = createHmac('sha256', secret)
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(input.canonicalEvidenceBytes)
    .digest('hex');

  return `${binding.scheme}:${binding.keyVersion}:${digest}`;
}
