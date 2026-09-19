import { PurchaseIntentCreateAuthorityPortErrorV3 } from './purchase-intent-create-command-v3.js';
import {
  STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4,
  StandardReadingPurchaseIntentAuthorityPortErrorV4,
  type StandardReadingPurchaseIntentAuthorityPortV4,
  type StandardReadingPurchaseIntentAuthorityRowV4,
} from './standard-reading-purchase-intent-create-command-v4.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export { STANDARD_READING_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V4 };

type AuthorityQueryRowV4 = Readonly<{
  purchaseIntentId: unknown;
  productOfferId: unknown;
  providerAccountLinkId: unknown;
  status: unknown;
  offerSnapshotJsonb: unknown;
  offerSnapshotHash: unknown;
  expectedAmountMinor: unknown;
  expectedCurrency: unknown;
  chargeTermsVersion: unknown;
  capabilitySetId: unknown;
  capabilitySnapshotJsonb: unknown;
  capabilitySnapshotHash: unknown;
  readerCharacterId: unknown;
  readerContentBundleId: unknown;
  readerSelectionSnapshotJsonb: unknown;
  readerSelectionHash: unknown;
  replayed: unknown;
}>;

const CREATE_SQL = `
select
  purchase_intent_id::text as "purchaseIntentId",
  product_offer_id::text as "productOfferId",
  provider_account_link_id::text as "providerAccountLinkId",
  status,
  offer_snapshot_jsonb as "offerSnapshotJsonb",
  offer_snapshot_hash as "offerSnapshotHash",
  expected_amount_minor::text as "expectedAmountMinor",
  expected_currency as "expectedCurrency",
  charge_terms_version as "chargeTermsVersion",
  capability_set_id::text as "capabilitySetId",
  capability_snapshot_jsonb as "capabilitySnapshotJsonb",
  capability_snapshot_hash as "capabilitySnapshotHash",
  reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",
  reader_selection_snapshot_jsonb as "readerSelectionSnapshotJsonb",
  reader_selection_hash as "readerSelectionHash",
  replayed
from public.cmd_create_standard_reading_purchase_intent_v4(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::jsonb,
  $8::text,
  $9::jsonb,
  $10::text,
  $11::uuid,
  $12::text,
  $13::uuid,
  $14::text,
  $15::jsonb,
  $16::text
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading Purchase Intent v4 PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  return value === null ? null : requireString(name, value);
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Standard Reading Purchase Intent v4 PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireSafePositiveInteger(name: string, value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/u.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Standard Reading Purchase Intent v4 PostgreSQL ${name} is invalid.`);
  }
  return parsed;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

function commonV3Code(constraint: string | null): ConstructorParameters<typeof PurchaseIntentCreateAuthorityPortErrorV3>[0] | null {
  switch (constraint) {
    case 'cmd_purchase_intent_v3_subject_not_found':
      return 'SUBJECT_NOT_FOUND';
    case 'cmd_purchase_intent_v3_subject_ineligible':
      return 'SUBJECT_INELIGIBLE';
    case 'cmd_purchase_intent_v3_offer_not_found':
      return 'OFFER_NOT_FOUND';
    case 'cmd_purchase_intent_v3_offer_unavailable':
      return 'OFFER_UNAVAILABLE';
    case 'cmd_purchase_intent_v3_charge_terms_unavailable':
      return 'CHARGE_TERMS_UNAVAILABLE';
    case 'cmd_purchase_intent_v3_capability_unavailable':
    case 'cmd_purchase_intent_v3_capability_nonempty':
      return 'CAPABILITY_UNAVAILABLE';
    case 'cmd_purchase_intent_v3_idempotency_conflict':
      return 'IDEMPOTENCY_CONFLICT';
    case 'cmd_purchase_intent_v3_replay_shape_conflict':
      return 'REPLAY_SHAPE_CONFLICT';
    case 'cmd_purchase_intent_v3_offer_snapshot_mismatch':
      return 'OFFER_SNAPSHOT_MISMATCH';
    case 'cmd_purchase_intent_v3_capability_snapshot_mismatch':
      return 'CAPABILITY_SNAPSHOT_MISMATCH';
    case 'cmd_purchase_intent_v3_capability_authority_mismatch':
      return 'CAPABILITY_AUTHORITY_MISMATCH';
    case 'cmd_purchase_intent_v3_replay_charge_terms_missing':
      return 'REPLAY_CHARGE_TERMS_MISSING';
    case 'cmd_purchase_intent_v3_replay_capability_missing':
      return 'REPLAY_CAPABILITY_MISSING';
    case 'cmd_purchase_intent_v3_replay_capability_conflict':
      return 'REPLAY_CAPABILITY_CONFLICT';
    case 'cmd_purchase_intent_v3_ids_required':
      return 'SERVER_ID_CONFLICT';
    case 'cmd_purchase_intent_v3_idempotency_required':
    case 'cmd_purchase_intent_v3_request_hash_required':
    case 'cmd_purchase_intent_v3_offer_snapshot_required':
    case 'cmd_purchase_intent_v3_capability_snapshot_required':
    case 'cmd_purchase_intent_v3_provider_link':
      return 'INVALID_INPUT';
    default:
      return null;
  }
}

function mapAuthorityError(error: unknown): never {
  const constraint = postgresConstraint(error);
  const v3Code = commonV3Code(constraint);
  if (v3Code !== null) {
    throw new StandardReadingPurchaseIntentAuthorityPortErrorV4(
      v3Code,
      'Standard Reading Purchase Intent v4 PostgreSQL rejected Purchase Intent authority.',
    );
  }

  switch (constraint) {
    case 'ct_reader_selection_reader_unavailable':
      throw new StandardReadingPurchaseIntentAuthorityPortErrorV4(
        'READER_UNAVAILABLE',
        'Standard Reading Reader is unavailable.',
      );
    case 'ct_reader_selection_purchase_product':
    case 'ct_reader_selection_product_contract':
    case 'ct_reader_selection_capability_pin':
    case 'ct_reader_selection_snapshot_mismatch':
    case 'cmd_standard_reading_purchase_v4_reader_required':
    case 'cmd_standard_reading_purchase_v4_replay_selection_missing':
    case 'cmd_standard_reading_purchase_v4_replay_selection_conflict':
      throw new StandardReadingPurchaseIntentAuthorityPortErrorV4(
        'READER_PROVENANCE_CONFLICT',
        'Standard Reading Reader provenance was rejected.',
      );
    default:
      if (postgresCode(error) === '23505') {
        throw new StandardReadingPurchaseIntentAuthorityPortErrorV4(
          'SERVER_ID_CONFLICT',
          'Standard Reading Purchase Intent identity conflicted.',
        );
      }
      throw error;
  }
}

function mapRows(rows: readonly AuthorityQueryRowV4[]): readonly StandardReadingPurchaseIntentAuthorityRowV4[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    purchaseIntentId: requireString('Purchase Intent id', row.purchaseIntentId),
    productOfferId: requireString('Offer id', row.productOfferId),
    providerAccountLinkId: requireNullableString('provider account link id', row.providerAccountLinkId),
    status: requireString('status', row.status),
    offerSnapshotJsonb: row.offerSnapshotJsonb,
    offerSnapshotHash: requireString('Offer snapshot hash', row.offerSnapshotHash),
    expectedAmountMinor: requireSafePositiveInteger('expected amount', row.expectedAmountMinor),
    expectedCurrency: requireString('expected currency', row.expectedCurrency),
    chargeTermsVersion: requireString('charge terms version', row.chargeTermsVersion),
    capabilitySetId: requireString('Capability Set id', row.capabilitySetId),
    capabilitySnapshotJsonb: row.capabilitySnapshotJsonb,
    capabilitySnapshotHash: requireString('Capability snapshot hash', row.capabilitySnapshotHash),
    readerCharacterId: requireString('Reader Character id', row.readerCharacterId),
    readerContentBundleId: requireString('Reader content bundle id', row.readerContentBundleId),
    readerSelectionSnapshotJsonb: row.readerSelectionSnapshotJsonb,
    readerSelectionHash: requireString('Reader selection hash', row.readerSelectionHash),
    replayed: requireBoolean('replay marker', row.replayed),
  })));
}

class PostgresStandardReadingPurchaseIntentAuthorityPortV4
implements StandardReadingPurchaseIntentAuthorityPortV4 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async createPurchaseIntent(
    input: Parameters<StandardReadingPurchaseIntentAuthorityPortV4['createPurchaseIntent']>[0],
  ): Promise<readonly StandardReadingPurchaseIntentAuthorityRowV4[]> {
    try {
      const result = await this.client.query<AuthorityQueryRowV4>(CREATE_SQL, [
        input.subjectId,
        input.purchaseIntentId,
        input.productOfferId,
        input.providerAccountLinkId,
        input.idempotencyKey,
        input.requestHash,
        JSON.stringify(input.offerSnapshotJsonb),
        input.offerSnapshotHash,
        JSON.stringify(input.capabilitySnapshotJsonb),
        input.capabilitySnapshotHash,
        input.productId,
        input.readerCharacterId,
        input.readerContentBundleId,
        input.readerSelectionContractVersion,
        JSON.stringify(input.readerSelectionSnapshotJsonb),
        input.readerSelectionHash,
      ]);
      return mapRows(result.rows);
    } catch (error) {
      return mapAuthorityError(error);
    }
  }
}

export function createPostgresStandardReadingPurchaseIntentAuthorityPortV4(
  client: PostgresTransactionQueryV1,
): StandardReadingPurchaseIntentAuthorityPortV4 {
  return new PostgresStandardReadingPurchaseIntentAuthorityPortV4(client);
}
