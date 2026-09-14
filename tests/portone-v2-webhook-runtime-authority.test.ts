import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(
  new URL('../apps/api/src/portone-v2-webhook-runtime.ts', import.meta.url),
  'utf8',
);

describe('PortOne V2 webhook runtime composition authority', () => {
  it('constructs the existing payment verification adapter exactly once and delegates to the existing HTTP boundary', () => {
    expect(SOURCE.match(/createPortOneV2PaymentVerificationAdapterV1\(/gu)).toHaveLength(1);
    expect(SOURCE).toContain('handlePortOneV2WebhookRequestV1({');
    expect(SOURCE).toContain('verificationAdapter,');
    expect(SOURCE).toContain('return Object.freeze({');
  });

  it('keeps server-owned configuration separated by responsibility', () => {
    expect(SOURCE).toContain('apiSecret: config.apiSecret');
    expect(SOURCE).toContain('evidenceHmacSecret: config.evidenceHmacSecret');
    expect(SOURCE).toContain('environment: config.environment');
    expect(SOURCE).toContain('webhookSecrets: Object.freeze([...config.webhookSecrets])');
    expect(SOURCE).toContain('timeoutMs: config.paymentTimeoutMs');
    expect(SOURCE).toContain('fetchImpl: config.paymentFetchImpl');
    expect(SOURCE).toContain('now: config.now');
  });

  it('does not bind deployment secrets, servers, routers, Production activation, or entitlement authority', () => {
    for (const forbidden of [
      'process.env',
      'createServer(',
      '.listen(',
      'app.post(',
      'router.post(',
      'PORTONE_WEBHOOK_SECRET',
      'PORTONE_API_SECRET',
      'MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET',
      'supabase',
      'entitlement',
    ]) {
      expect(SOURCE).not.toContain(forbidden);
    }
  });
});
