/**
 * D3e7 PRIVATE, isolated one-alert dispatch candidate.
 *
 * DB-derived aggregate alert -> deduped durable outbox -> fenced lease ->
 * explicitly injected delivery transport -> fenced DB acknowledgement.
 *
 * No runtime boot, HTTP route, cron, default transport, real destination,
 * webhook/payment identifiers, refund, entitlement effect, or purge.
 * External delivery is AT-LEAST-ONCE: retry may redeliver if accepted but
 * confirmation COMMIT fails; consumers must dedupe on alertId.
 */
export type PrivateCancelAlertCodeV1 =
  | 'HELD_REVIEW_REQUIRED'
  | 'DEAD_LETTER_REVIEW_REQUIRED'
  | 'EXPIRED_LEASES_PRESENT'
  | 'UNRESOLVED_AGE_EXCEEDED';

export type PrivateCancelAlertDeliveryStateV1 =
  'delivered' | 'retry_wait' | 'dead_letter';

export type PrivateCancelAlertClaimV1 = Readonly<{
  alertId: string;
  alertKind: PrivateCancelAlertCodeV1;
  deliveryToken: string;
  deliveryAttempt: number;
  effectAuthorized: false;
}>;

export interface PrivateCancelAlertOutboxPortV1 {
  /** SQL 1940: aggregates existing private queue metrics into deduped windows. */
  enqueueCurrentAlerts(): Promise<unknown>;
  /** Single DB-autocommitted row claim, committed BEFORE delivery. */
  claimNext(workerId: string, leaseSeconds: number): Promise<unknown>;
  /** One fenced committed acknowledgement/failed-attempt transition. */
  finalize(
    alertId: string,
    workerId: string,
    claimToken: string,
    acknowledged: boolean,
  ): Promise<unknown>;
}

export interface PrivateCancelAlertTransportV1 {
  /**
   * Caller MUST inject a transport. This package never creates a live
   * notification endpoint. Stable alertId is an at-least-once idempotency key.
   * Throw or return false to signal failure (never persist error text).
   */
  deliver(message: Readonly<{
    alertId: string;
    alertCode: PrivateCancelAlertCodeV1;
    idempotencyKey: string;
  }>): Promise<Readonly<{ acknowledged: boolean }>>;
}

export type PrivateCancelAlertTickV1 =
  | Readonly<{
      kind: 'idle';
      enqueued: number;
      effectAuthorized: false;
    }>
  | Readonly<{
      kind: PrivateCancelAlertDeliveryStateV1;
      enqueued: number;
      alertCode: PrivateCancelAlertCodeV1;
      attempt: number;
      effectAuthorized: false;
      providerRefundAuthorized: false;
      entitlementMutationAuthorized: false;
    }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const WORKER = /^[A-Za-z0-9_-]{1,96}$/u;
const CODES: readonly PrivateCancelAlertCodeV1[] = Object.freeze([
  'HELD_REVIEW_REQUIRED','DEAD_LETTER_REVIEW_REQUIRED',
  'EXPIRED_LEASES_PRESENT','UNRESOLVED_AGE_EXCEEDED',
]);
function isCode(x: unknown): x is PrivateCancelAlertCodeV1 {
  return typeof x === 'string' && CODES.includes(x as PrivateCancelAlertCodeV1);
}
function validUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID.test(x);
}
function record(x: unknown): Record<string, unknown> {
  if (x===null || typeof x!=='object' || Array.isArray(x)) {
    throw new Error('Private cancellation alert SQL response is invalid.');
  }
  return x as Record<string, unknown>;
}
function readEnqueued(value: unknown): number {
  const data = record(value);
  if (typeof data.enqueuedCount!=='number' || !Number.isSafeInteger(data.enqueuedCount)
    || data.enqueuedCount<0 || data.enqueuedCount>4
    || data.effectAuthorized!==false) {
    throw new Error('Private cancellation alert enqueue returned an invalid count.');
  }
  return data.enqueuedCount;
}
function readClaim(value: unknown): PrivateCancelAlertClaimV1 | null {
  if (value===null) return null;
  const data=record(value);
  if (!validUuid(data.alertId) || !validUuid(data.deliveryToken)
    || !isCode(data.alertKind)
    || typeof data.deliveryAttempt!=='number'
    || !Number.isSafeInteger(data.deliveryAttempt)
    || data.deliveryAttempt<1 || data.deliveryAttempt>5
    || data.effectAuthorized!==false) {
    throw new Error('Private cancellation alert claim violates fenced contract.');
  }
  return Object.freeze({
    alertId: data.alertId,alertKind:data.alertKind,
    deliveryToken:data.deliveryToken,deliveryAttempt:data.deliveryAttempt,
    effectAuthorized:false,
  });
}
function readFinalize(value: unknown, wasAcknowledged: boolean): PrivateCancelAlertDeliveryStateV1 {
  const data=record(value);
  const state=data.finalState;
  if (data.effectAuthorized!==false
    || (state!=='delivered' && state!=='retry_wait' && state!=='dead_letter')
    || (wasAcknowledged && state!=='delivered')
    || (!wasAcknowledged && state==='delivered')) {
    throw new Error('Private cancellation alert finalize returned an invalid state.');
  }
  return state;
}

/** One explicit OFFLINE tick only. No global fetch, timers, or background loops. */
export async function deliverOnePrivateCancelAlertV1(input: Readonly<{
  outbox: PrivateCancelAlertOutboxPortV1;
  transport: PrivateCancelAlertTransportV1;
  workerId: string;
  leaseSeconds: number;
}>): Promise<PrivateCancelAlertTickV1> {
  if (typeof input.workerId!=='string' || !WORKER.test(input.workerId)
    || !Number.isSafeInteger(input.leaseSeconds)
    || input.leaseSeconds<30 || input.leaseSeconds>300
    || typeof input.transport?.deliver!=='function') {
    throw new Error('Private cancellation alert delivery configuration invalid.');
  }
  // Enqueue and claim commit before transport interaction.
  const enqueued=readEnqueued(await input.outbox.enqueueCurrentAlerts());
  const claimed=readClaim(await input.outbox.claimNext(input.workerId,input.leaseSeconds));
  if (claimed===null) {
    return Object.freeze({kind:'idle',enqueued,effectAuthorized:false});
  }

  let acknowledged=false;
  try {
    const result=await input.transport.deliver(Object.freeze({
      alertId:claimed.alertId,
      alertCode:claimed.alertKind,
      idempotencyKey:'myeongha-private-cancel-alert-v1:'+claimed.alertId,
    }));
    // An ambiguous transport reply MUST fail closed, never treated as success.
    acknowledged=result!==null && typeof result==='object'
      && !Array.isArray(result) && result.acknowledged===true;
  } catch {
    // Failures are not written to SQL logs or payloads. At-least-once recovery.
    acknowledged=false;
  }
  const state=readFinalize(
    await input.outbox.finalize(
      claimed.alertId,input.workerId,claimed.deliveryToken,acknowledged,
    ),
    acknowledged,
  );
  return Object.freeze({
    kind:state,enqueued,alertCode:claimed.alertKind,attempt:claimed.deliveryAttempt,
    effectAuthorized:false,providerRefundAuthorized:false,
    entitlementMutationAuthorized:false,
  });
}
