import { ApiCommandError } from './api-error.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedPortOneV2FullCancellationV1 } from './portone-v2-payment-verification-adapter.js';

const APPLY_SQL = `
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  $1::text,$2::text,$3::text,$4::timestamptz,$5::bigint,
  $6::text,$7::text,$8::text,$9::text
) as "result"
`;

export type AppliedPortOneV2ReaderFullCancellationV1 =
  | Readonly<{ kind: 'unrelated_commerce' }>
  | Readonly<{ kind: 'cancelled_before_grant'; receiptId: string;
  readonly providerEventId: string;
  grantCount: 0 }>
  | Readonly<{ kind: 'revoked'; receiptId: string;
  readonly providerEventId: string;
  grantCount: number }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;


/**
 * Inspect the actual 1900/1910 DB effect contracts, not merely their counts.
 * A positive grantCount with an empty/malformed/duplicated effect must never
 * commit as a successful Reader revoke. Replayed effects identify the exact
 * existing Entitlement Event; an already-revoked Grant may instead legitimately
 * produce the 1080 no-material-change result with no new Event or Outbox.
 */
function hasAuthoritativeGrantEffects(
  effects: readonly unknown[],
  contractVersion: unknown,
): boolean {
  const grantIds = new Set<string>();
  const entitlementEventIds = new Set<string>();
  for (const effect of effects) {
    if (typeof effect !== 'object' || effect === null || Array.isArray(effect)) {
      return false;
    }
    const entry = effect as Record<string, unknown>;
    let grantId: unknown;
    let eventId: unknown;
    if (contractVersion === 'official-reader-s2-revoke-dispatch-v1') {
      // 1910 dispatch returns one 1770 scoped-provider-revoke result per Grant.
      if (entry.contractVersion !== 'official-reader-s2-provider-revoke-v1' ||
          !Number.isSafeInteger(entry.scopeCount) ||
          (entry.scopeCount as number) < 1 ||
          typeof entry.replayed !== 'boolean') return false;
      grantId = entry.grantId;
      eventId = entry.entitlementEventId;
    } else if (contractVersion === 'official-reader-s2-unbound-grant-cancellation-v1') {
      // 1900 directly serializes the original 1080 effect row to JSON.
      if (typeof entry.result_replayed !== 'boolean') return false;
      grantId = entry.result_grant_id;
      eventId = entry.result_entitlement_event_id;
    } else {
      return false;
    }
    // Existing Commerce 1080 can return a legitimate no-material-change
    // outcome when this Grant was ALREADY revoked by a different verified
    // lifecycle event. It has no new Entitlement Event, no projection change
    // and no Outbox event. The original Receipt is still revoked by 1900.
    // A replay of THIS event, by contrast, has its original Event ID.
    if (typeof grantId !== 'string' || !UUID.test(grantId) ||
        grantIds.has(grantId.toLowerCase())) return false;
    if (eventId === null) {
      const noOp = contractVersion === 'official-reader-s2-revoke-dispatch-v1'
        ? entry.replayed === false && entry.projectionChanged === false &&
          entry.outboxEventId === null
        : entry.result_replayed === false &&
          entry.result_projection_changed === false &&
          entry.result_outbox_event_id === null;
      if (!noOp) return false;
    } else {
      if (typeof eventId !== 'string' || !UUID.test(eventId) ||
          entitlementEventIds.has(eventId.toLowerCase())) return false;
      entitlementEventIds.add(eventId.toLowerCase());
    }
    grantIds.add(grantId.toLowerCase());
  }
  return true;
}

/**
 * Internal Commerce transaction only. No caller-supplied Subject/Reader/Grant,
 * no public route and no PSP refund request. The DB command resolves the
 * original Receipt, acquires all shared Reader locks and atomically revokes.
 */
export async function applyVerifiedPortOneV2ReaderFullCancellationV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly evidence: VerifiedPortOneV2FullCancellationV1;
}): Promise<AppliedPortOneV2ReaderFullCancellationV1> {
  const e = input.evidence;
  if (e.environment !== 'production') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Reader cancellation requires an original production receipt.',
    );
  }
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      const response = await client.query<{result?: unknown}>(APPLY_SQL,[
        e.paymentId,e.transactionId,e.cancellationId,e.cancelledAt,
        e.verifiedAmountMinor,e.verifiedCurrency,e.environment,
        e.evidenceFingerprint,e.verifierRevision,
      ]);
      if (response.rows.length !== 1 || typeof response.rows[0]?.result !== 'object'
          || response.rows[0]?.result === null
          || Array.isArray(response.rows[0]?.result)) {
        throw new Error('Verified Reader cancellation did not return one committed result.');
      }
      const result = response.rows[0].result as Record<string,unknown>;
      if (result.contractVersion === 'portone-reader-full-cancellation-v1'
          && result.disposition === 'unrelated_commerce') {
        return Object.freeze({ kind: 'unrelated_commerce' as const });
      }
      const revoke = result.revoke;
      if (result.contractVersion !== 'portone-reader-full-cancellation-v1'
          || typeof result.receiptId !== 'string' || !UUID.test(result.receiptId)
          || typeof result.providerEventId !== 'string'
          || !UUID.test(result.providerEventId)
          || typeof revoke !== 'object' || revoke === null
          || Array.isArray(revoke)
          || !Number.isSafeInteger((revoke as Record<string,unknown>).grantCount)
          || ((revoke as Record<string,unknown>).grantCount as number) < 0) {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      const effect = revoke as Record<string,unknown>;
      const grantCount = effect.grantCount as number;
      if (grantCount === 0) {
        // A verified full cancellation before Grant issuance still revokes
        // the Receipt and persists one Provider Event. Refusing this valid
        // 1900 result would ROLLBACK the cancellation and endlessly retry.
        if (effect.contractVersion !== 'official-reader-s2-no-grant-cancellation-v1'
            || effect.disposition !== 'cancelled_before_grant'
            || effect.scopeCount !== 0) {
          throw new Error('Verified Reader cancellation result was not authoritative.');
        }
        return Object.freeze({
          kind: 'cancelled_before_grant' as const,
          receiptId: result.receiptId,
          providerEventId: result.providerEventId,
          grantCount: 0 as const,
        });
      }
      // This is a DB-authoritative effect, not a successful webhook merely
      // because some JSON reported a positive grantCount. The 1900/1910
      // writers have distinct lock/lineage contracts; reject a malformed
      // result INSIDE the transaction so Receipt/Event/Grant all roll back.
      if (!Array.isArray(effect.effects)
          || effect.effects.length !== grantCount
          || !hasAuthoritativeGrantEffects(effect.effects, effect.contractVersion)
          || !Number.isSafeInteger(effect.scopeCount)
          || (effect.scopeCount as number) < 0) {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      if (effect.contractVersion === 'official-reader-s2-unbound-grant-cancellation-v1') {
        if (effect.disposition !== 'cancelled_before_binding'
            || effect.scopeCount !== 0) {
          throw new Error('Verified Reader cancellation result was not authoritative.');
        }
      } else if (effect.contractVersion === 'official-reader-s2-revoke-dispatch-v1') {
        if ((effect.scopeCount as number) < 1
            || (effect.scopeCount as number) > grantCount
            || effect.providerEventId !== result.providerEventId) {
          throw new Error('Verified Reader cancellation result was not authoritative.');
        }
      } else {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      return Object.freeze({
        kind: 'revoked' as const,
        receiptId: result.receiptId,
        providerEventId: result.providerEventId,
        grantCount,
      });
    },
  });
}
