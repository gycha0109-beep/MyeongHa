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
  const configSnapshot = Object.freeze({
    environment: config.environment,
    webhookSecrets: Object.freeze([...config.webhookSecrets]),
    apiSecret: config.apiSecret,
    evidenceHmacSecret: config.evidenceHmacSecret,
    timeoutMs: config.paymentTimeoutMs,
    fetchImpl: config.paymentFetchImpl,
    now: config.now,
  });

  const verificationAdapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: configSnapshot.apiSecret,
    evidenceHmacSecret: configSnapshot.evidenceHmacSecret,
    ...(configSnapshot.timeoutMs === undefined
      ? {}
      : { timeoutMs: configSnapshot.timeoutMs }),
    ...(configSnapshot.fetchImpl === undefined
      ? {}
      : { fetchImpl: configSnapshot.fetchImpl }),
    ...(configSnapshot.now === undefined ? {} : { now: configSnapshot.now }),
  });

  const webhookConfig: PortOneV2WebhookPaymentCompletionConfigV1 = Object.freeze({
    environment: configSnapshot.environment,
    webhookSecrets: configSnapshot.webhookSecrets,
    ...(configSnapshot.now === undefined ? {} : { now: configSnapshot.now }),
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
