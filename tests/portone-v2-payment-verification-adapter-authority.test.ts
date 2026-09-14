import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const adapter = readFileSync(
  join(
    process.cwd(),
    'apps',
    'api',
    'src',
    'portone-v2-payment-verification-adapter.ts',
  ),
  'utf8',
);

describe('PortOne V2 payment verification adapter authority', () => {
  it('binds the exact canonical PortOne provider and server payment lookup endpoint', () => {
    expect(adapter).toContain("'https://api.portone.io'");
    expect(adapter).toContain("request.provider !== 'portone_v2'");
    expect(adapter).toContain('/payments/${encodeURIComponent(paymentId)}');
    expect(adapter).toContain("method: 'GET'");
    expect(adapter).toContain("redirect: 'error'");
    expect(adapter).toContain('authorization: `PortOne ${input.apiSecret}`');
  });

  it('accepts only PAID for initial active evidence and derives environment from selectedChannel', () => {
    expect(adapter).toContain("payment.status !== 'PAID'");
    expect(adapter).toContain("currentState: 'active'");
    expect(adapter).toContain("channel.type === 'TEST'");
    expect(adapter).toContain("channel.type === 'LIVE'");
    expect(adapter).toContain("if (channel.type === 'TEST') return 'sandbox'");
    expect(adapter).toContain("if (channel.type === 'LIVE') return 'production'");
  });

  it('extracts provider-owned product and minor-unit money facts without caller substitution', () => {
    expect(adapter).toContain('products.length !== 1');
    expect(adapter).toContain("boundedIdentity(product.id, 'PortOne V2 payment product id')");
    expect(adapter).toContain('const total = record.total');
    expect(adapter).toContain('verifiedAmountMinor: payment.amountMinor');
    expect(adapter).toContain('verifiedCurrency: payment.currency');
    expect(adapter).not.toContain('externalProductId: request.expectedExternalProductId');
    expect(adapter).not.toContain('verifiedAmountMinor: request.expectedAmountMinor');
    expect(adapter).not.toContain('verifiedCurrency: request.expectedCurrency');
    expect(adapter).not.toContain('environment: request.environment');
  });

  it('fingerprints only canonical normalized evidence with the existing HMAC authority', () => {
    expect(adapter).toContain('fingerprintProductionCommerceEvidenceV1({');
    expect(adapter).toContain('.receiptEvidence');
    expect(adapter).toContain("schemaVersion: 'myeongha.portone-v2.payment-evidence-fingerprint.v1'");
    expect(adapter).not.toContain('canonicalEvidenceBytes: Buffer.from(JSON.stringify(rawPayment)');
    expect(adapter).not.toContain('verifiedAt: input');
  });

  it('does not add live secret binding, webhook, entitlement, or Production mutation authority', () => {
    expect(adapter).not.toContain('process.env');
    expect(adapter).not.toMatch(/webhook/iu);
    expect(adapter).not.toMatch(/entitlement/iu);
    expect(adapter).not.toMatch(/supabase/iu);
    expect(adapter).not.toMatch(/grant/iu);
  });

  it('bounds provider transport and never exposes upstream error bodies', () => {
    expect(adapter).toContain('PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1');
    expect(adapter).toContain('PORTONE_V2_PAYMENT_HTTP_DEFAULT_TIMEOUT_MS_V1');
    expect(adapter).toContain('controller.abort()');
    expect(adapter).toContain('assertDeclaredBodyBound(response)');
    expect(adapter).toContain("Buffer.byteLength(text, 'utf8')");
    expect(adapter).not.toContain('await response.text()');
    expect(adapter).not.toMatch(/provider.*body.*message/iu);
  });
});
