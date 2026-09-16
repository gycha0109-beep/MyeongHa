import { describe, expect, it, vi } from 'vitest';
import type { CommercePaymentVerificationAdapterV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import {
  authenticatePortOneV2WebhookPaymentCompletionV1,
  executePortOneV2WebhookPaymentCompletionV1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';

const request = () =>
  Object.freeze({
    rawBody: '{}',
    headers: Object.freeze({
      'content-type': 'application/json',
      'webhook-id': 'webhook_clock_failure',
    }),
  });

const throwingConfig = (rawError: Error) =>
  Object.freeze({
    environment: 'sandbox' as const,
    webhookSecrets: Object.freeze([] as string[]),
    now: () => {
      throw rawError;
    },
  });

describe('PortOne V2 webhook verification clock failure boundary', () => {
  it('maps a throwing injected clock to the existing generic invalid-configuration error', () => {
    const rawError = new Error('raw-webhook-clock-detail');
    let caught: unknown;

    try {
      authenticatePortOneV2WebhookPaymentCompletionV1({
        request: request(),
        config: throwingConfig(rawError),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      name: 'PortOneV2WebhookPaymentCompletionErrorV1',
      code: 'INVALID_CONFIGURATION',
      message: 'PortOne V2 webhook verification clock is invalid.',
    });
    expect(caught).not.toBe(rawError);
    expect(String(caught)).not.toContain(rawError.message);
  });

  it('stops before DB access and provider payment verification when the clock throws', async () => {
    const rawError = new Error('raw-webhook-clock-detail');
    const connect = vi.fn(async () => {
      throw new Error('DB access must not occur');
    });
    const verify = vi.fn(async () => {
      throw new Error('provider payment verification must not occur');
    });
    const pool: PostgresSubjectPoolV1 = Object.freeze({ connect });
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = Object.freeze({ verify });

    await expect(
      executePortOneV2WebhookPaymentCompletionV1({
        pool,
        request: request(),
        config: throwingConfig(rawError),
        verificationAdapter,
      }),
    ).rejects.toMatchObject({
      name: 'PortOneV2WebhookPaymentCompletionErrorV1',
      code: 'INVALID_CONFIGURATION',
      message: 'PortOne V2 webhook verification clock is invalid.',
    });

    expect(connect).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
});
