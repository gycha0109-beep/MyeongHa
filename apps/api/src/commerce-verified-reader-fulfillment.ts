import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  applyVerifiedReaderReceiptBindV1,
  type AppliedVerifiedReaderReceiptBindV1,
} from './commerce-verified-reader-receipt-bind.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const RESOLVE_SQL = `
select
  purchase_intent_id::text as "purchaseIntentId",
  existing_official_reading_id::text as "existingOfficialReadingId",
  capability_item_key as "capabilityItemKey",
  validity_mode as "validityMode",
  purchase_role as "purchaseRole",
  prepared_at as "preparedAt"
from public.internal_resolve_verified_reader_receipt_fulfillment_v1($1::uuid)
`;

export type VerifiedReaderPurchaseRoleV1 =
  | 'initial_reading'
  | 'additional_reader_interpretation';

export type FulfilledVerifiedReaderReceiptV1 = AppliedVerifiedReaderReceiptBindV1 & Readonly<{
  /** Immutable Purchase Intent / Offer-role fact, not inferred from UI. */
  purchaseRole: VerifiedReaderPurchaseRoleV1;
}>;

type FulfillmentAuthorityRow = Readonly<{
  purchaseIntentId: unknown;
  existingOfficialReadingId: unknown;
  capabilityItemKey: unknown;
  validityMode: unknown;
  purchaseRole: unknown;
  preparedAt: unknown;
}>;

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error(`Stored verified Reader fulfillment ${label} is invalid.`);
  }
  return value.toLowerCase();
}

function requirePreparationTime(value: unknown): string {
  const timestamp = value instanceof Date ? value : (
    typeof value === 'string' ? new Date(value) : null
  );
  if (!timestamp || !Number.isFinite(timestamp.getTime())) {
    throw new Error('Stored verified Reader fulfillment clock is invalid.');
  }
  return timestamp.toISOString();
}

/**
 * Connects the canonical provider-verified Receipt to the existing S2
 * atomic Receipt -> Grant -> Reader Access writer.
 *
 * For non-Reader Commerce purchases this is a no-op. Reader identity,
 * capability and the existing official Reading are resolved from the
 * database, not the webhook payload. No protected interpretation is created,
 * stored or disclosed here. Call only from the trusted Commerce server after
 * successful verified payment persistence and only when the private S2
 * integration is explicitly enabled by its owner.
 */
export async function fulfillVerifiedReaderReceiptV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly receiptId: string;
}): Promise<FulfilledVerifiedReaderReceiptV1 | null> {
  const receiptId = requireUuid(input.receiptId, 'Receipt ID');
  const rows = await executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      const result = await client.query<FulfillmentAuthorityRow>(RESOLVE_SQL, [receiptId]);
      return result.rows;
    },
  });

  if (rows.length === 0) return null;
  if (rows.length !== 1 || !rows[0]) {
    throw new Error('Stored verified Reader fulfillment must resolve one purchase.');
  }

  const row = rows[0];
  const purchaseIntentId = requireUuid(row.purchaseIntentId, 'Purchase Intent ID');
  const capabilityItemKey = row.capabilityItemKey;
  if (typeof capabilityItemKey !== 'string' || capabilityItemKey.trim() === '') {
    throw new Error('Stored verified Reader capability item is unavailable.');
  }

  // The current Standard Reading candidate pins one unbounded Capability Item.
  // Do not invent a provider-expiry or fixed-duration validity anchor.
  if (row.validityMode !== 'unbounded') {
    throw new Error('Reader Capability validity policy is not configured for fulfillment.');
  }
  if (row.purchaseRole !== 'initial_reading'
      && row.purchaseRole !== 'additional_reader_interpretation') {
    throw new Error('Stored Reader purchase role is invalid.');
  }

  const proposedReadingSessionId = randomUUID();
  const proposedReadingId = randomUUID();
  const existingReadingId = row.existingOfficialReadingId;
  if (existingReadingId !== null && existingReadingId !== undefined) {
    requireUuid(existingReadingId, 'existing official Reading ID');
  }
  if (row.purchaseRole === 'additional_reader_interpretation' &&
      (existingReadingId === null || existingReadingId === undefined)) {
    throw new Error('Additional Reader purchase needs an existing official Reading.');
  }
  const expectedOfficialReadingId = existingReadingId == null
    ? proposedReadingId
    : requireUuid(existingReadingId, 'existing official Reading ID');

  const snapshot = Object.freeze({
    schemaVersion: 'standard-reading-access-bind-v2' as const,
    purchaseIntentId,
  });
  const requestHash = `sha256:v1:${createHash('sha256')
    .update(canonicalJson(snapshot), 'utf8')
    .digest('hex')}`;
  const effectiveAt = requirePreparationTime(row.preparedAt);

  const result = await applyVerifiedReaderReceiptBindV1({
    pool: input.pool,
    receiptId,
    expectedOfficialReadingId,
    proposedReadingSessionId,
    proposedReadingId,
    requestHash,
    effects: Object.freeze([{
      capabilityItemKey,
      effectiveAt,
      targetValidFrom: effectiveAt,
      targetValidUntil: null,
      reasonCode: null,
    }]),
  });
  // A second Reader is an independently bought interpretation of the
  // EXISTING official Reading, never a second Saju Source Truth. The DB
  // supplied this role from an immutable Offer, not the browser.
  if (row.purchaseRole === 'additional_reader_interpretation'
      && result.officialReadingId !== existingReadingId) {
    throw new Error('Additional Reader fulfillment changed official Reading identity.');
  }
  return Object.freeze({
    ...result,
    purchaseRole: row.purchaseRole,
  });
}
