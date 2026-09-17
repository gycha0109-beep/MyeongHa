import type {
  PurchaseIntentOfferSnapshotPortV1,
  PurchaseIntentOfferSnapshotV1,
  PurchaseIntentPlatformV1,
} from './purchase-intent-create-command.js';
import {
  PurchaseIntentCreateAuthorityPortErrorV3,
  type PurchaseIntentCapabilitySnapshotPortV3,
  type PurchaseIntentCapabilitySnapshotV3,
  type PurchaseIntentCreateAuthorityPortV3,
  type PurchaseIntentCreateAuthorityRowV3,
} from './purchase-intent-create-command-v3.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_PURCHASE_INTENT_RUNTIME_SNAPSHOT_BINDING_V3 =
  'public.qry_purchase_intent_runtime_snapshot_v3' as const;
export const POSTGRES_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3 =
  'public.cmd_create_purchase_intent_v3' as const;

type SnapshotQueryRowV3 = Readonly<{
  productOfferId: unknown;
  productId: unknown;
  platform: unknown;
  provider: unknown;
  externalProductId: unknown;
  capabilitySetId: unknown;
  capabilityDefinitionVersion: unknown;
  capabilityDefinitionHash: unknown;
}>;

type AuthorityQueryRowV3 = Readonly<{
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
  replayed: unknown;
}>;

type ResolvedRuntimeSnapshotV3 = Readonly<{
  offer: PurchaseIntentOfferSnapshotV1;
  capability: PurchaseIntentCapabilitySnapshotV3 | null;
}>;

const SNAPSHOT_SQL = `
select
  product_offer_id::text as "productOfferId",
  product_id::text as "productId",
  platform as "platform",
  provider as "provider",
  external_product_id as "externalProductId",
  capability_set_id::text as "capabilitySetId",
  capability_definition_version as "capabilityDefinitionVersion",
  capability_definition_hash as "capabilityDefinitionHash"
from public.qry_purchase_intent_runtime_snapshot_v3($1::uuid)
`.trim();

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
  replayed
from public.cmd_create_purchase_intent_v3(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5::text,
  $6::text,
  $7::jsonb,
  $8::text,
  $9::jsonb,
  $10::text
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Purchase Intent v3 PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  return value === null ? null : requireString(name, value);
}

function requirePlatform(value: unknown): PurchaseIntentPlatformV1 {
  if (value === 'web' || value === 'ios' || value === 'android') return value;
  throw new Error('Purchase Intent v3 PostgreSQL platform is invalid.');
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Purchase Intent v3 PostgreSQL ${name} is invalid.`);
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
    throw new Error(`Purchase Intent v3 PostgreSQL ${name} is invalid.`);
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

function mapAuthorityError(error: unknown): never {
  const constraint = postgresConstraint(error);
  const mapped = (code: ConstructorParameters<typeof PurchaseIntentCreateAuthorityPortErrorV3>[0], message: string): never => {
    throw new PurchaseIntentCreateAuthorityPortErrorV3(code, message);
  };

  switch (constraint) {
    case 'cmd_purchase_intent_v3_subject_ineligible':
      return mapped('SUBJECT_INELIGIBLE', 'Purchase Intent subject is ineligible.');
    case 'cmd_purchase_intent_v3_offer_not_found':
      return mapped('OFFER_NOT_FOUND', 'Purchase Intent Offer was not found.');
    case 'cmd_purchase_intent_v3_offer_unavailable':
      return mapped('OFFER_UNAVAILABLE', 'Purchase Intent Offer is unavailable.');
    case 'cmd_purchase_intent_v3_charge_terms_unavailable':
      return mapped('CHARGE_TERMS_UNAVAILABLE', 'Purchase Intent charge terms are unavailable.');
    case 'cmd_purchase_intent_v3_capability_unavailable':
    case 'cmd_purchase_intent_v3_capability_nonempty':
      return mapped('CAPABILITY_UNAVAILABLE', 'Purchase Intent Capability authority is unavailable.');
    case 'cmd_purchase_intent_v3_idempotency_conflict':
      return mapped('IDEMPOTENCY_CONFLICT', 'Purchase Intent idempotency key conflicts with an existing request.');
    case 'cmd_purchase_intent_v3_replay_shape_conflict':
      return mapped('REPLAY_SHAPE_CONFLICT', 'Purchase Intent replay shape conflicts with historical authority.');
    case 'cmd_purchase_intent_v3_offer_snapshot_mismatch':
      return mapped('OFFER_SNAPSHOT_MISMATCH', 'Purchase Intent Offer snapshot was rejected.');
    case 'cmd_purchase_intent_v3_capability_snapshot_mismatch':
      return mapped('CAPABILITY_SNAPSHOT_MISMATCH', 'Purchase Intent Capability snapshot was rejected.');
    case 'cmd_purchase_intent_v3_capability_authority_mismatch':
      return mapped('CAPABILITY_AUTHORITY_MISMATCH', 'Purchase Intent Capability authority was rejected.');
    case 'cmd_purchase_intent_v3_replay_charge_terms_missing':
      return mapped('REPLAY_CHARGE_TERMS_MISSING', 'Purchase Intent replay is missing charge authority.');
    case 'cmd_purchase_intent_v3_replay_capability_missing':
      return mapped('REPLAY_CAPABILITY_MISSING', 'Purchase Intent replay is missing Capability authority.');
    case 'cmd_purchase_intent_v3_replay_capability_conflict':
      return mapped('REPLAY_CAPABILITY_CONFLICT', 'Purchase Intent replay Capability authority conflicts.');
    case 'cmd_purchase_intent_v3_ids_required':
      return mapped('SERVER_ID_CONFLICT', 'Purchase Intent server identity was rejected.');
    case 'cmd_purchase_intent_v3_idempotency_required':
    case 'cmd_purchase_intent_v3_request_hash_required':
    case 'cmd_purchase_intent_v3_offer_snapshot_required':
    case 'cmd_purchase_intent_v3_capability_snapshot_required':
    case 'cmd_purchase_intent_v3_provider_link':
      return mapped('INVALID_INPUT', 'Purchase Intent create input was rejected.');
    default:
      if (postgresCode(error) === '23505') {
        return mapped('SERVER_ID_CONFLICT', 'Purchase Intent server identity conflicted with existing data.');
      }
      throw error;
  }
}

function mapSnapshotRows(rows: readonly SnapshotQueryRowV3[]): ResolvedRuntimeSnapshotV3 | null {
  if (rows.length === 0) return null;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Purchase Intent v3 PostgreSQL snapshot resolver returned multiple rows.');
  }
  const row = rows[0];
  const productOfferId = requireString('snapshot Offer id', row.productOfferId);
  const offer = Object.freeze({
    productOfferId,
    productId: requireString('snapshot Product id', row.productId),
    platform: requirePlatform(row.platform),
    provider: requireString('snapshot provider', row.provider),
    externalProductId: requireString('snapshot external Product id', row.externalProductId),
  });

  const capabilitySetId = requireNullableString('snapshot Capability Set id', row.capabilitySetId);
  const definitionVersion = requireNullableString('snapshot Capability definition version', row.capabilityDefinitionVersion);
  const definitionHash = requireNullableString('snapshot Capability definition hash', row.capabilityDefinitionHash);
  const allNull = capabilitySetId === null && definitionVersion === null && definitionHash === null;
  const allPresent = capabilitySetId !== null && definitionVersion !== null && definitionHash !== null;
  if (!allNull && !allPresent) {
    throw new Error('Purchase Intent v3 PostgreSQL Capability snapshot authority is internally inconsistent.');
  }

  return Object.freeze({
    offer,
    capability: allPresent
      ? Object.freeze({ capabilitySetId, definitionVersion, definitionHash })
      : null,
  });
}

function mapAuthorityRows(rows: readonly AuthorityQueryRowV3[]): readonly PurchaseIntentCreateAuthorityRowV3[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    purchaseIntentId: requireString('authority Purchase Intent id', row.purchaseIntentId),
    productOfferId: requireString('authority Offer id', row.productOfferId),
    providerAccountLinkId: requireNullableString('authority provider account link id', row.providerAccountLinkId),
    status: requireString('authority status', row.status),
    offerSnapshotJsonb: row.offerSnapshotJsonb,
    offerSnapshotHash: requireString('authority Offer snapshot hash', row.offerSnapshotHash),
    expectedAmountMinor: requireSafePositiveInteger('authority expected amount', row.expectedAmountMinor),
    expectedCurrency: requireString('authority expected currency', row.expectedCurrency),
    chargeTermsVersion: requireString('authority charge terms version', row.chargeTermsVersion),
    capabilitySetId: requireString('authority Capability Set id', row.capabilitySetId),
    capabilitySnapshotJsonb: row.capabilitySnapshotJsonb,
    capabilitySnapshotHash: requireString('authority Capability snapshot hash', row.capabilitySnapshotHash),
    replayed: requireBoolean('authority replay marker', row.replayed),
  })));
}

class PostgresPurchaseIntentRuntimePortsImplV3
implements PurchaseIntentOfferSnapshotPortV1, PurchaseIntentCapabilitySnapshotPortV3, PurchaseIntentCreateAuthorityPortV3 {
  private readonly snapshotCache = new Map<string, Promise<ResolvedRuntimeSnapshotV3 | null>>();

  constructor(private readonly client: PostgresTransactionQueryV1) {}

  private resolveSnapshot(productOfferId: string): Promise<ResolvedRuntimeSnapshotV3 | null> {
    const existing = this.snapshotCache.get(productOfferId);
    if (existing !== undefined) return existing;
    const pending = Promise.resolve(this.client.query<SnapshotQueryRowV3>(SNAPSHOT_SQL, [productOfferId]))
      .then((result) => mapSnapshotRows(result.rows));
    this.snapshotCache.set(productOfferId, pending);
    return pending;
  }

  async resolveImmutableOfferMapping(input: { readonly productOfferId: string }): Promise<PurchaseIntentOfferSnapshotV1 | null> {
    const snapshot = await this.resolveSnapshot(input.productOfferId);
    return snapshot?.offer ?? null;
  }

  async resolveImmutableCapabilityMapping(input: { readonly productOfferId: string }): Promise<PurchaseIntentCapabilitySnapshotV3 | null> {
    const snapshot = await this.resolveSnapshot(input.productOfferId);
    return snapshot?.capability ?? null;
  }

  async createPurchaseIntent(input: Parameters<PurchaseIntentCreateAuthorityPortV3['createPurchaseIntent']>[0]): Promise<readonly PurchaseIntentCreateAuthorityRowV3[]> {
    try {
      const result = await this.client.query<AuthorityQueryRowV3>(CREATE_SQL, [
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
      ]);
      return mapAuthorityRows(result.rows);
    } catch (error) {
      return mapAuthorityError(error);
    }
  }
}

export type PostgresPurchaseIntentRuntimePortsV3 = Readonly<{
  offerSnapshotPort: PurchaseIntentOfferSnapshotPortV1;
  capabilitySnapshotPort: PurchaseIntentCapabilitySnapshotPortV3;
  authorityPort: PurchaseIntentCreateAuthorityPortV3;
}>;

export function createPostgresPurchaseIntentRuntimePortsV3(
  client: PostgresTransactionQueryV1,
): PostgresPurchaseIntentRuntimePortsV3 {
  const ports = new PostgresPurchaseIntentRuntimePortsImplV3(client);
  return Object.freeze({
    offerSnapshotPort: ports,
    capabilitySnapshotPort: ports,
    authorityPort: ports,
  });
}
