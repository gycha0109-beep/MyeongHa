import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authenticatePortOneV2WebhookPaymentCompletionV1 } from '../apps/api/src/portone-v2-webhook-payment-completion.js';

const NOW = new Date('2026-09-15T02:10:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const SERIALIZED_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const BARE_SECRET = SECRET_BYTES.toString('base64');

function rawBody(): string {
  return JSON.stringify({
    type: 'Transaction.Paid',
    timestamp: '2026-09-15T02:09:59.000Z',
    data: {
      paymentId: 'payment-whsec-1',
      transactionId: 'transaction-whsec-1',
    },
  });
}

function request(body: string) {
  const signature = createHmac('sha256', SECRET_BYTES)
    .update('msg_whsec_1')
    .update('.')
    .update(String(NOW_SECONDS))
    .update('.')
    .update(body)
    .digest('base64');

  return {
    rawBody: body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_whsec_1',
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': `v1,${signature}`,
    },
  };
}

function config(webhookSecret: string) {
  return {
    environment: 'sandbox' as const,
    webhookSecrets: [webhookSecret],
    now: () => NOW,
  };
}

describe('PortOne V2 webhook secret serialization', () => {
  it('accepts the governed whsec_ serialization and rejects the same key as bare base64', () => {
    const body = rawBody();

    expect(
      authenticatePortOneV2WebhookPaymentCompletionV1({
        request: request(body),
        config: config(SERIALIZED_SECRET),
      }),
    ).toMatchObject({
      kind: 'payment_completion',
      providerWebhookId: 'msg_whsec_1',
    });

    try {
      authenticatePortOneV2WebhookPaymentCompletionV1({
        request: request(body),
        config: config(BARE_SECRET),
      });
      throw new Error('expected invalid configuration');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_CONFIGURATION' });
      expect(String(error)).not.toContain(BARE_SECRET.slice(0, 16));
      expect(String(error)).not.toContain(SERIALIZED_SECRET.slice(0, 16));
    }
  });
});
