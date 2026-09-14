import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentHttpFetchV1,
} from './portone-v2-payment-verification-adapter.js';
import {
  handlePortOneV2WebhookRequestV1,
} from './portone-v2-webhook-http.js';
import type { PortOneV2WebhookPaymentCompletionConfigV1 } from './portone-v2-webhook-payment-completion.js';

export interface PortOneV2WebhookRuntimeConfigV1 {
  readonly environment: 'sandbox' | 'production';
  readonly webhookSecrets: readonly string[];
  readonly apiSecret: string;
  readonly evidenceHmacSecret: string;
  readonly paymentTimeoutMs?: number;
  readonly paymentFetchImpl?: PortOneV2PaymentHttpFetchV1;
  readonly now?: () => Date;
}

export interface CreatePortOneV2WebhookRuntimeInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly config: PortOneV2WebhookRuntimeConfigV1;
}

export interface PortOneV2WebhookRuntimeV1 {
  readonly handleRequest: (request: Request) => Promise<Response>;
}

export function createPortOneV2WebhookRuntimeV1(
  input: CreatePortOneV2WebhookRuntimeInputV1,
): PortOneV2WebhookRuntimeV1 {
  const config = input.config;
  const verificationAdapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: config.apiSecret,
    evidenceHmacSecret: config.evidenceHmacSecret,
    ...(config.paymentTimeoutMs === undefined
      ? {}
      : { timeoutMs: config.paymentTimeoutMs }),
    ...(config.paymentFetchImpl === undefined
      ? {}
      : { fetchImpl: config.paymentFetchImpl }),
    ...(config.now === undefined ? {} : { now: config.now }),
  });

  const webhookConfig: PortOneV2WebhookPaymentCompletionConfigV1 = Object.freeze({
    environment: config.environment,
    webhookSecrets: Object.freeze([...config.webhookSecrets]),
    ...(config.now === undefined ? {} : { now: config.now }),
  });
  const pool = input.pool;

  return Object.freeze({
    handleRequest: (request: Request) =>
      handlePortOneV2WebhookRequestV1({
        request,
        pool,
        config: webhookConfig,
        verificationAdapter,
      }),
  });
}
