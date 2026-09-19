import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  createStandardReadingReaderSelectionResolverV4,
  type StandardReadingCharacterUnlockProjectionPortV4,
  type StandardReadingReaderCatalogPortV4,
  type StandardReadingReaderCatalogResolutionV4,
} from './standard-reading-reader-selection-resolver-v4.js';
import type { StandardReadingReaderSelectionPortV4 } from './standard-reading-purchase-intent-create-command-v4.js';

export const POSTGRES_STANDARD_READING_READER_CATALOG_BINDING_V4 =
  'public.qry_standard_reading_reader_catalog_v4' as const;
export const POSTGRES_STANDARD_READING_READER_UNLOCK_BINDING_V4 =
  'public.qry_standard_reading_reader_unlock_v4' as const;

type CatalogQueryRowV4 = Readonly<{
  productId: unknown;
  topicKey: unknown;
  specVersion: unknown;
  readerSelectionMode: unknown;
  purchaseUnitMode: unknown;
  readerCharacterId: unknown;
  readerContentBundleId: unknown;
  catalogAvailability: unknown;
  catalogEnabled: unknown;
}>;

type UnlockQueryRowV4 = Readonly<{
  status: unknown;
}>;

const CATALOG_SQL = `
select
  product_id::text as "productId",
  topic_key as "topicKey",
  spec_version as "specVersion",
  reader_selection_mode as "readerSelectionMode",
  purchase_unit_mode as "purchaseUnitMode",
  reader_character_id as "readerCharacterId",
  reader_content_bundle_id::text as "readerContentBundleId",
  catalog_availability as "catalogAvailability",
  catalog_enabled as "catalogEnabled"
from public.qry_standard_reading_reader_catalog_v4($1::uuid, $2::text)
`.trim();

const UNLOCK_SQL = `
select status
from public.qry_standard_reading_reader_unlock_v4($1::uuid, $2::text)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Standard Reading Reader PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Standard Reading Reader PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function mapCatalogRows(
  rows: readonly CatalogQueryRowV4[],
): StandardReadingReaderCatalogResolutionV4 | null {
  if (rows.length === 0) return null;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Standard Reading Reader PostgreSQL catalog resolver returned multiple rows.');
  }
  const row = rows[0];
  return Object.freeze({
    productId: requireString('Product id', row.productId),
    topicKey: requireString('topic key', row.topicKey),
    specVersion: requireString('Product spec version', row.specVersion),
    readerSelectionMode: requireString('Reader selection mode', row.readerSelectionMode),
    purchaseUnitMode: requireString('purchase unit mode', row.purchaseUnitMode),
    readerCharacterId: requireString('Reader Character id', row.readerCharacterId),
    readerContentBundleId: requireString('Reader content bundle id', row.readerContentBundleId),
    catalogAvailability: requireString('catalog availability', row.catalogAvailability),
    catalogEnabled: requireBoolean('catalog enabled flag', row.catalogEnabled),
  });
}

function mapUnlockRows(
  rows: readonly UnlockQueryRowV4[],
): { readonly status: 'locked' | 'unlocked' } | null {
  if (rows.length === 0) return null;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error('Standard Reading Reader PostgreSQL unlock resolver returned multiple rows.');
  }
  const status = rows[0].status;
  if (status !== 'locked' && status !== 'unlocked') {
    throw new Error('Standard Reading Reader PostgreSQL unlock status is invalid.');
  }
  return Object.freeze({ status });
}

class PostgresStandardReadingReaderSelectionPortsV4
implements StandardReadingReaderCatalogPortV4, StandardReadingCharacterUnlockProjectionPortV4 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async resolveReaderCatalog(input: {
    readonly productId: string;
    readonly readerCharacterId: string;
  }): Promise<StandardReadingReaderCatalogResolutionV4 | null> {
    const result = await this.client.query<CatalogQueryRowV4>(CATALOG_SQL, [
      input.productId,
      input.readerCharacterId,
    ]);
    return mapCatalogRows(result.rows);
  }

  async resolveCharacterUnlock(input: {
    readonly subjectId: string;
    readonly readerCharacterId: string;
  }): Promise<{ readonly status: 'locked' | 'unlocked' } | null> {
    const result = await this.client.query<UnlockQueryRowV4>(UNLOCK_SQL, [
      input.subjectId,
      input.readerCharacterId,
    ]);
    return mapUnlockRows(result.rows);
  }
}

export type PostgresStandardReadingReaderSelectionPortsV4 = Readonly<{
  catalogPort: StandardReadingReaderCatalogPortV4;
  unlockProjectionPort: StandardReadingCharacterUnlockProjectionPortV4;
}>;

export function createPostgresStandardReadingReaderSelectionPortsV4(
  client: PostgresTransactionQueryV1,
): PostgresStandardReadingReaderSelectionPortsV4 {
  const ports = new PostgresStandardReadingReaderSelectionPortsV4(client);
  return Object.freeze({
    catalogPort: ports,
    unlockProjectionPort: ports,
  });
}

export function createPostgresStandardReadingReaderSelectionPortV4(
  client: PostgresTransactionQueryV1,
): StandardReadingReaderSelectionPortV4 {
  return createStandardReadingReaderSelectionResolverV4(
    createPostgresStandardReadingReaderSelectionPortsV4(client),
  );
}
