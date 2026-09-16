import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { CommercePaymentVerificationAdapterV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  PortOneV2WebhookPaymentCompletionErrorV1,
  authenticatePortOneV2WebhookPaymentCompletionV1,
  executePortOneV2WebhookPaymentCompletionV1,
  type PortOneV2WebhookPaymentCompletionConfigV1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';

const NOW = new Date('2026-09-14T06:20:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function paidBody(): string {
  return JSON.stringify({
    type: 'Transaction.Paid',
    timestamp: '2026-09-14T06:19:59.000Z',
    data: {
      paymentId: 'payment-1',
      transactionId: 'transaction-1',
    },
  });
}

function signedRequest() {
  const rawBody = paidBody();
  const signature = createHmac('sha256', SECRET_BYTES)
    .update('msg_config_access')
    .update('.')
    .update(String(NOW_SECONDS))
    .update('.')
    .update(Buffer.from(rawBody))
    .digest('base64');

  return Object.freeze({
    rawBody,
    headers: Object.freeze({
      'content-type': 'application/json',
      'webhook-id': 'msg_config_access',
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': `v1,${signature}`,
    }),
  });
}

function expectConfigAccessFailure(
  config: PortOneV2WebhookPaymentCompletionConfigV1,
  rawMarker: string,
): void {
  let caught: unknown;
  try {
    authenticatePortOneV2WebhookPaymentCompletionV1({
      request: Object.freeze({ rawBody: '{}', headers: Object.freeze({}) }),
      config,
    });
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(PortOneV2WebhookPaymentCompletionErrorV1);
  expect(caught).toMatchObject({
    name: 'PortOneV2WebhookPaymentCompletionErrorV1',
    code: 'INVALID_CONFIGURATION',
    message: 'PortOne V2 webhook configuration could not be read.',
  });
  expect(String(caught)).not.toContain(rawMarker);
}

describe('PortOne V2 webhook verification config access boundary', () => {
  it('maps a throwing required environment accessor to generic INVALID_CONFIGURATION', () => {
    const marker = 'raw-webhook-environment-accessor-detail';
    const config = {
      get environment(): 'sandbox' {
        throw new Error(marker);
      },
      webhookSecrets: Object.freeze([SECRET]),
      now: () => NOW,
    } as PortOneV2WebhookPaymentCompletionConfigV1;

    expectConfigAccessFailure(config, marker);
  });

  it('maps a throwing optional now accessor to the same generic config-read boundary', () => {
    const marker = 'raw-webhook-now-accessor-detail';
    const config = {
      environment: 'sandbox' as const,
      webhookSecrets: Object.freeze([SECRET]),
      get now(): () => Date {
        throw new Error(marker);
      },
    } as PortOneV2WebhookPaymentCompletionConfigV1;

    expectConfigAccessFailure(config, marker);
  });

  it('stops before DB access and provider payment verification when config cannot be read', async () => {
    const connect = vi.fn(async () => {
      throw new Error('DB access must not occur');
    });
    const verify = vi.fn(async () => {
      throw new Error('provider payment verification must not occur');
    });
    const pool: PostgresSubjectPoolV1 = Object.freeze({ connect });
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = Object.freeze({ verify });
    const config = {
      get environment(): 'sandbox' {
        throw new Error('raw-unreadable-config-detail');
      },
      webhookSecrets: Object.freeze([SECRET]),
      now: () => NOW,
    } as PortOneV2WebhookPaymentCompletionConfigV1;

    await expect(
      executePortOneV2WebhookPaymentCompletionV1({
        pool,
        request: signedRequest(),
        config,
        verificationAdapter,
      }),
    ).rejects.toMatchObject({
      name: 'PortOneV2WebhookPaymentCompletionErrorV1',
      code: 'INVALID_CONFIGURATION',
      message: 'PortOne V2 webhook configuration could not be read.',
    });

    expect(connect).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('reads environment exactly once and reuses the accepted snapshot downstream', () => {
    let environmentReads = 0;
    const config = {
      get environment(): 'sandbox' | 'production' {
        environmentReads += 1;
        return environmentReads === 1 ? 'sandbox' : 'production';
      },
      webhookSecrets: Object.freeze([SECRET]),
      now: () => NOW,
    } as PortOneV2WebhookPaymentCompletionConfigV1;

    const result = authenticatePortOneV2WebhookPaymentCompletionV1({
      request: signedRequest(),
      config,
    });

    expect(environmentReads).toBe(1);
    expect(result).toMatchObject({
      kind: 'payment_completion',
      authenticatedIngress: {
        provider: 'portone_v2',
        environment: 'sandbox',
        providerRequestId: 'payment-1',
        providerTransactionId: 'transaction-1',
      },
    });
  });

  it('preserves field-specific validation after a readable config snapshot', () => {
    const config = {
      environment: 'invalid',
      webhookSecrets: Object.freeze([SECRET]),
      now: () => NOW,
    } as unknown as PortOneV2WebhookPaymentCompletionConfigV1;

    expect(() =>
      authenticatePortOneV2WebhookPaymentCompletionV1({
        request: signedRequest(),
        config,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'INVALID_CONFIGURATION',
        message: 'PortOne V2 webhook environment is invalid.',
      }),
    );
  });
});
