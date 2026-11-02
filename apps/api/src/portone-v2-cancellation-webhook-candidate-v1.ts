import {
  authenticatePortOneV2WebhookPaymentCompletionV1,
  PortOneV2WebhookPaymentCompletionErrorV1,
  PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
  type PortOneV2WebhookRequestV1,
  type PortOneV2WebhookPaymentCompletionConfigV1,
} from './portone-v2-webhook-payment-completion.js';

/**
 * Internal, unmounted cancellation notification admission candidate.
 * Reuses the EXACT signed webhook authenticator; nothing is persisted or paid.
 * A signed provider event is a re-lookup trigger, NOT finality or refund authority.
 */
export const PORTONE_V2_CANCELLATION_WEBHOOK_CANDIDATE_V1 = Object.freeze({
  productionMounted: false,
  publicWebhookRouteMounted: false,
  persistenceEnabled: false,
  providerLookupEnabled: false,
  refundEnabled: false,
  entitlementMutationEnabled: false,
} as const);

type CancellationTagV1 =
  | 'Transaction.CancelPending'
  | 'Transaction.PartialCancelled'
  | 'Transaction.Cancelled';

export type PortOneV2CancellationWebhookCandidateV1 =
  | Readonly<{
      kind: 'not_cancellation_event';
      providerLookupRequired: false;
      providerRefundAuthorized: false;
      entitlementMutationAuthorized: false;
    }>
  | Readonly<{
      kind: 'cancellation_lookup_candidate';
      eventType: CancellationTagV1;
      providerWebhookId: string;
      providerPaymentId: string;
      providerTransactionId: string | null;
      providerCancellationId: string | null;
      providerLookupRequired: true;
      fullRefundProven: false;
      cancellationFinalityEstablished: false;
      providerRefundAuthorized: false;
      entitlementMutationAuthorized: false;
    }>;

const IGNORED: PortOneV2CancellationWebhookCandidateV1 = Object.freeze({
  kind: 'not_cancellation_event',
  providerLookupRequired: false,
  providerRefundAuthorized: false,
  entitlementMutationAuthorized: false,
});
const TYPES: ReadonlySet<string> = new Set([
  'Transaction.CancelPending',
  'Transaction.PartialCancelled',
  'Transaction.Cancelled',
]);

function fail(): never {
  throw new PortOneV2WebhookPaymentCompletionErrorV1(
    'INVALID_WEBHOOK', 'PortOne V2 cancellation candidate payload is invalid.',
  );
}
function id(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 ||
      value.length > 512 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) return fail();
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}

/**
 * Authenticates the exact same immutable body bytes which are then parsed.
 * This explicitly avoids a second request.rawBody getter read or a different
 * parser input after signature verification. No caller-provided Subject, money,
 * cancellation amount, environment or entitlement is considered trustworthy.
 */
export function authenticatePortOneV2CancellationWebhookCandidateV1(input: {
  readonly request: PortOneV2WebhookRequestV1;
  readonly config: PortOneV2WebhookPaymentCompletionConfigV1;
}): PortOneV2CancellationWebhookCandidateV1 {
  let request: PortOneV2WebhookRequestV1;
  try {
    const sourceBody = input.request.rawBody;
    const rawBody = typeof sourceBody === 'string'
      ? sourceBody
      : Uint8Array.from(sourceBody);
    if (typeof rawBody !== 'string' && !(rawBody instanceof Uint8Array)) {
      return fail();
    }
    const bodySize = typeof rawBody === 'string'
      ? Buffer.byteLength(rawBody, 'utf8')
      : rawBody.byteLength;
    if (bodySize === 0 || bodySize > PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1) {
      return fail();
    }
    request = Object.freeze({ rawBody, headers: input.request.headers });
  } catch {
    throw new PortOneV2WebhookPaymentCompletionErrorV1(
      'INVALID_REQUEST', 'PortOne V2 cancellation webhook request could not be read.',
    );
  }

  // Existing signed authenticator verifies timestamp, signature, header shape,
  // bounded raw bytes and event type before a cancellation data field is read.
  const authentication = authenticatePortOneV2WebhookPaymentCompletionV1({
    request, config: input.config,
  });
  if (authentication.kind !== 'ignored' ||
      !TYPES.has(authentication.eventType)) return IGNORED;

  let payload: Record<string, unknown>;
  try {
    const decoded = typeof request.rawBody === 'string'
      ? request.rawBody
      : new TextDecoder('utf-8', { fatal: true }).decode(request.rawBody);
    payload = record(JSON.parse(decoded) as unknown);
  } catch {
    return fail();
  }
  if (payload.type !== authentication.eventType) return fail();
  const data = record(payload.data);
  const paymentId = id(data.paymentId);
  const transactionId = data.transactionId === undefined ||
    data.transactionId === null ? null : id(data.transactionId);
  const cancellationId = data.cancellationId === undefined ||
    data.cancellationId === null ? null : id(data.cancellationId);

  return Object.freeze({
    kind: 'cancellation_lookup_candidate',
    eventType: authentication.eventType as CancellationTagV1,
    providerWebhookId: authentication.providerWebhookId,
    providerPaymentId: paymentId,
    providerTransactionId: transactionId,
    providerCancellationId: cancellationId,
    providerLookupRequired: true,
    fullRefundProven: false,
    cancellationFinalityEstablished: false,
    providerRefundAuthorized: false,
    entitlementMutationAuthorized: false,
  });
}
