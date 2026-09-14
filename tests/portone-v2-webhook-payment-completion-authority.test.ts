import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL(
    '../apps/api/src/portone-v2-webhook-payment-completion.ts',
    import.meta.url,
  ),
  'utf8',
);

describe('PortOne V2 webhook payment completion static authority', () => {
  it('implements Standard Webhooks HMAC framing with constant-time comparison over raw body bytes', () => {
    expect(source).toContain("import { createHmac, timingSafeEqual } from 'node:crypto'");
    expect(source).toContain(".update(input.webhookId, 'utf8')");
    expect(source).toContain(".update(input.timestamp, 'utf8')");
    expect(source).toContain('.update(input.rawBody)');
    expect(source).toContain('timingSafeEqual(digest, signature)');
    expect(source).not.toContain('JSON.stringify');
  });

  it('projects only PortOne payment identity plus configuration-bound environment into provider-neutral ingress', () => {
    const start = source.indexOf('function paidIngress(');
    const end = source.indexOf('\n}\n\nexport function authenticatePortOneV2WebhookPaymentCompletionV1', start);
    const projection = source.slice(start, end);
    expect(projection).toContain("provider: 'portone_v2'");
    expect(projection).toContain('environment,');
    expect(projection).toContain('providerRequestId: paymentId');
    expect(projection).toContain('providerTransactionId: transactionId');
    expect(projection).not.toContain('subjectId');
    expect(projection).not.toContain('amount');
    expect(projection).not.toContain('currency');
    expect(projection).not.toContain('productId');
    expect(projection).not.toContain('externalProductId');
    expect(projection).not.toContain('success');
  });

  it('preserves provider forward compatibility by terminating verified non-paid events before generic completion orchestration', () => {
    const start = source.indexOf('export async function executePortOneV2WebhookPaymentCompletionV1');
    const body = source.slice(start);
    expect(body).toContain("if (decision.kind === 'ignored') return decision;");
    expect(body).toContain('executeAuthenticatedCommerceProviderPaymentCompletionV1({');
    expect(body.indexOf("if (decision.kind === 'ignored') return decision;")).toBeLessThan(
      body.indexOf('executeAuthenticatedCommerceProviderPaymentCompletionV1({'),
    );
  });

  it('adds no live credential binding, route activation, entitlement mutation, or provider payload persistence authority', () => {
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('Entitlement');
    expect(source).not.toContain('/webhook');
    expect(source).not.toContain('insert into');
    expect(source).not.toContain('rawPayload');
  });
});
