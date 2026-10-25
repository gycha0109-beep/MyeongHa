/**
 * Private S7 Checkout producer admission check, for disposable isolation and
 * later integration by an approved Commerce-owned immutable writer.
 *
 * An affirmative result is permission to attempt the separate approved write,
 * never evidence that any durable record exists, nor legal delivery proof.
 * No HTTP route, payment executor, database role or Production activation.
 */
export type ReaderCheckoutPrepaymentEventV1 = Readonly<{
  kind: 'snapshot_recorded' | 'notice_presented' | 'customer_confirmed' | 'payment_attempt_started';
  purchaseIntentId: string;
  pinnedCapabilityItemKey: string;
  productSpecVersion: string;
  noticeRevision: string;
  previewOrInformationRevision: string;
  occurredAt: string;
  attemptNo?: number;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY = /^[a-z0-9][a-z0-9._:\-]{0,127}$/u;
const ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/u;

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO.test(value)) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === value.slice(0, 19)
    ? t : null;
}
function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 256 && value.trim() === value;
}

/**
 * Checks ONE original checkout sequence. Replayed payment attempts cannot
 * replace the original first attempt or make a later consent retroactive.
 * Event arrays are untrusted until the approved producer authenticates and
 * durably records them. This function does not create an attested notice.
 */
export function checkReaderCheckoutPrepaymentSequenceV1(
  events: readonly ReaderCheckoutPrepaymentEventV1[],
): Readonly<{ eligibleForApprovedWriter: boolean; reason: 'ordered' | 'invalid_or_missing' }> {
  const denied = Object.freeze({ eligibleForApprovedWriter: false, reason: 'invalid_or_missing' as const });
  if (!Array.isArray(events) || events.length !== 4) return denied;
  const order = ['snapshot_recorded', 'notice_presented', 'customer_confirmed', 'payment_attempt_started'];
  const first = events[0];
  if (!first || !UUID.test(first.purchaseIntentId) || !KEY.test(first.pinnedCapabilityItemKey) ||
      !bounded(first.productSpecVersion) || !bounded(first.noticeRevision) ||
      !bounded(first.previewOrInformationRevision)) return denied;

  let previous: number | null = null;
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (!event || event.kind !== order[index] ||
        event.purchaseIntentId !== first.purchaseIntentId ||
        event.pinnedCapabilityItemKey !== first.pinnedCapabilityItemKey ||
        event.productSpecVersion !== first.productSpecVersion ||
        event.noticeRevision !== first.noticeRevision ||
        event.previewOrInformationRevision !== first.previewOrInformationRevision) return denied;
    const current = timestamp(event.occurredAt);
    if (current === null || (previous !== null && current < previous)) return denied;
    if (index === 3) {
      if (event.attemptNo !== 1 || previous === null || current <= previous) return denied;
    } else if (event.attemptNo !== undefined) return denied;
    previous = current;
  }
  return Object.freeze({ eligibleForApprovedWriter: true, reason: 'ordered' as const });
}
