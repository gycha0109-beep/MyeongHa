import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../apps/api/src/portone-v2-webhook-http.ts', import.meta.url),
  'utf8',
);

describe('PortOne V2 webhook HTTP static authority', () => {
  it('owns only the exact thin POST route contract', () => {
    expect(source).toContain("const POST_METHOD = 'POST' as const;");
    expect(source).toContain("const ROUTE = '/api/commerce/webhooks/portone-v2' as const;");
    expect(source).toContain("url.pathname === ROUTE && url.search === '' && url.hash === ''");
    expect(source).toContain("return noStoreResponse(405, { Allow: POST_METHOD });");
  });

  it('reads raw bytes incrementally without parsing or reserializing provider JSON', () => {
    expect(source).toContain('const body = request.body;');
    expect(source).toContain('const reader = body.getReader();');
    expect(source).toContain('const chunk = await reader.read();');
    expect(source).toContain('reader.releaseLock();');
    expect(source).not.toContain('request.arrayBuffer()');
    expect(source).not.toContain('request.json()');
    expect(source).not.toContain('request.text()');
    expect(source).not.toContain('JSON.stringify');
    expect(source).toContain('rawBody,');
    expect(source).toContain('headers: requestHeaders(input.request)');
  });

  it('delegates all signature/event/payment authority to the closed PortOne webhook completion slice', () => {
    expect(source).toContain("from './portone-v2-webhook-payment-completion.js'");
    expect(source).toContain('await executePortOneV2WebhookPaymentCompletionV1({');
    expect(source).toContain('config: input.config');
    expect(source).toContain('verificationAdapter: input.verificationAdapter');
    expect(source).not.toContain('createHmac');
    expect(source).not.toContain('timingSafeEqual');
    expect(source).not.toContain('Transaction.Paid');
  });

  it('returns identifier-free 204 and generic 400/503 responses only', () => {
    expect(source).toContain('return noStoreResponse(204);');
    expect(source).toContain("code: 'INVALID_WEBHOOK'");
    expect(source).toContain("code: 'TEMPORARILY_UNAVAILABLE'");
    expect(source).not.toContain('paymentAttemptId');
    expect(source).not.toContain('receiptId');
    expect(source).not.toContain('providerEventId');
    expect(source).not.toContain('providerWebhookId');
    expect(source).not.toContain('transactionId');
  });

  it('adds no deployment, secret binding, entitlement, refund, persistence, or stream-disposal authority', () => {
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('PORTONE_WEBHOOK_SECRET');
    expect(source).not.toContain('createServer');
    expect(source).not.toContain('listen(');
    expect(source).not.toContain('Entitlement');
    expect(source).not.toContain('refund');
    expect(source).not.toContain('cancel');
    expect(source).not.toContain('insert into');
  });
});
