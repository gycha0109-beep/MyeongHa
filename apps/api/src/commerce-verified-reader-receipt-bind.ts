import { ApiCommandError } from './api-error.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const REQUEST_HASH = /^sha256:v1:[0-9a-f]{64}$/u;

const APPLY_SQL = `
select public.cmd_apply_verified_reader_receipt_bind_internal_v1(
  $1::uuid,$2::uuid,$3::text[],$4::timestamptz[],
  $5::timestamptz[],$6::timestamptz[],$7::text[],
  $8::uuid,$9::uuid,$10::text
) as "result"
`;

export interface VerifiedReaderReceiptBindEffectV1 {
  readonly capabilityItemKey: string;
  readonly effectiveAt: string;
  readonly targetValidFrom: string;
  readonly targetValidUntil: string | null;
  readonly reasonCode: string;
}

export interface VerifiedReaderReceiptBindInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  /** Already-persisted, provider-verified Receipt. No raw payment/browser evidence. */
  readonly receiptId: string;
  readonly expectedOfficialReadingId: string;
  readonly proposedReadingSessionId: string;
  readonly proposedReadingId: string;
  readonly requestHash: string;
  /** Trusted Commerce capability effects; DB rechecks each against the Receipt. */
  readonly effects: readonly VerifiedReaderReceiptBindEffectV1[];
}

export interface AppliedVerifiedReaderReceiptBindV1 {
  readonly receiptId: string;
  readonly purchaseIntentId: string;
  readonly entitlementGrantId: string;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly capabilityEffectCount: number;
}

function requireUuid(value: string, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ApiCommandError('INVALID_REQUEST', `${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Internal Commerce-only writer. It does NOT call PortOne, grant privileges to
 * HTTP callers, publish a paid interpretation, or create an unverified Receipt.
 * The DB derives Subject/Purchase/Reader from stored verified evidence and
 * performs grant issuance + Reader bind in exactly one SQL transaction.
 */
export async function applyVerifiedReaderReceiptBindV1(
  input: VerifiedReaderReceiptBindInputV1,
): Promise<AppliedVerifiedReaderReceiptBindV1> {
  const receiptId = requireUuid(input.receiptId, 'receiptId');
  const expectedOfficialReadingId = requireUuid(
    input.expectedOfficialReadingId, 'expectedOfficialReadingId',
  );
  const proposedReadingSessionId = requireUuid(
    input.proposedReadingSessionId, 'proposedReadingSessionId',
  );
  const proposedReadingId = requireUuid(input.proposedReadingId, 'proposedReadingId');
  if (typeof input.requestHash !== 'string' || !REQUEST_HASH.test(input.requestHash)
      || !Array.isArray(input.effects) || input.effects.length === 0
      || input.effects.length > 64) {
    throw new ApiCommandError('INVALID_REQUEST', 'Verified Reader bind input is invalid.');
  }

  const capabilityItemKeys: string[] = [];
  const effectiveAts: string[] = [];
  const targetValidFroms: string[] = [];
  const targetValidUntils: (string | null)[] = [];
  const reasonCodes: string[] = [];

  for (const effect of input.effects) {
    if (!effect || typeof effect.capabilityItemKey !== 'string'
        || effect.capabilityItemKey.length === 0
        || typeof effect.reasonCode !== 'string' || effect.reasonCode.length === 0
        || typeof effect.effectiveAt !== 'string'
        || !Number.isFinite(Date.parse(effect.effectiveAt))
        || typeof effect.targetValidFrom !== 'string'
        || !Number.isFinite(Date.parse(effect.targetValidFrom))
        || (effect.targetValidUntil !== null &&
          (typeof effect.targetValidUntil !== 'string'
            || !Number.isFinite(Date.parse(effect.targetValidUntil))))) {
      throw new ApiCommandError('INVALID_REQUEST', 'Verified Reader capability effect is invalid.');
    }
    capabilityItemKeys.push(effect.capabilityItemKey);
    effectiveAts.push(effect.effectiveAt);
    targetValidFroms.push(effect.targetValidFrom);
    targetValidUntils.push(effect.targetValidUntil);
    reasonCodes.push(effect.reasonCode);
  }

  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      const response = await client.query<{ result?: unknown }>(APPLY_SQL, [
        receiptId,expectedOfficialReadingId,capabilityItemKeys,effectiveAts,
        targetValidFroms,targetValidUntils,reasonCodes,
        proposedReadingSessionId,proposedReadingId,input.requestHash,
      ]);
      const result = response.rows.length === 1
        ? objectRecord(response.rows[0]?.result) : null;
      const access = objectRecord(result?.readerAccess);
      const effects = result?.capabilityEffects;
      if (result?.contractVersion !== 'official-reader-s2-atomic-receipt-bind-v1'
          || !Array.isArray(effects) || effects.length !== input.effects.length
          || !access || typeof access.reader_character_id !== 'string'
          || access.reader_character_id.length === 0
          || typeof access.purchase_intent_id !== 'string'
          || !UUID.test(access.purchase_intent_id)
          || typeof access.entitlement_grant_id !== 'string'
          || !UUID.test(access.entitlement_grant_id)
          || access.reading_id !== expectedOfficialReadingId
          || access.replayed !== false
          || (access.official_reading_created !== true
              && access.official_reading_created !== false)
          || (access.interpretation_created !== true
              && access.interpretation_created !== false)) {
        // Throwing inside the Commerce transaction rolls back Grant AND bind.
        throw new Error('Verified Reader receipt bind returned an invalid atomic result.');
      }
      return Object.freeze({
        receiptId,
        purchaseIntentId: access.purchase_intent_id,
        entitlementGrantId: access.entitlement_grant_id,
        officialReadingId: expectedOfficialReadingId,
        readerCharacterId: access.reader_character_id,
        capabilityEffectCount: effects.length,
      });
    },
  });
}
