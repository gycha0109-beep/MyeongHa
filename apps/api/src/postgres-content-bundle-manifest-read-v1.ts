import {
  ContentBundleManifestReadAuthorityPortErrorV1,
  type ContentBundleManifestAuthorityRowV1,
  type ContentBundleManifestReadAuthorityPortV1,
} from './content-bundle-manifest-read.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type Row = Readonly<Record<string, unknown>>;

export const POSTGRES_CONTENT_BUNDLE_MANIFEST_READ_BINDING_V1 =
  'public.qry_content_bundle_manifest_v1' as const;

const READ_SQL = `
select
  content_version as "contentVersion",
  min_client_capability as "minClientCapability",
  character_ids as "characterIds",
  asset_manifest_hash as "assetManifestHash",
  cue_schema_version as "cueSchemaVersion"
from public.qry_content_bundle_manifest_v1($1::uuid)
`.trim();

function constraintOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function mapError(error: unknown): never {
  switch (constraintOf(error)) {
    case 'qry_content_bundle_manifest_bundle_required':
      throw new ContentBundleManifestReadAuthorityPortErrorV1(
        'INVALID_INPUT',
        'Content bundle manifest identity was rejected.',
      );
    case 'qry_content_bundle_manifest_bundle_unavailable':
      throw new ContentBundleManifestReadAuthorityPortErrorV1(
        'BUNDLE_UNAVAILABLE',
        'Content bundle manifest is unavailable.',
      );
    default:
      throw error;
  }
}

function text(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Content bundle manifest PostgreSQL ' + name + ' is invalid.');
  }
  return value.trim();
}

function characterIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(
      'Content bundle manifest PostgreSQL character identities are invalid.',
    );
  }
  const ids = value.map((entry) => text('Character id', entry));
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      'Content bundle manifest PostgreSQL character identities contain duplicates.',
    );
  }
  return Object.freeze(ids);
}

function one(rows: readonly Row[]): Row {
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new Error(
      'Content bundle manifest PostgreSQL query must return exactly one row.',
    );
  }
  return rows[0];
}

class PostgresContentBundleManifestReadAuthorityPortV1
implements ContentBundleManifestReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readBundleManifest(
    input: Parameters<ContentBundleManifestReadAuthorityPortV1['readBundleManifest']>[0],
  ): Promise<ContentBundleManifestAuthorityRowV1> {
    try {
      const result = await this.client.query<Row>(READ_SQL, [
        input.contentBundleId,
      ]);
      const row = one(result.rows);
      return Object.freeze({
        contentVersion: text('content version', row.contentVersion),
        minClientCapability: text(
          'minimum client capability',
          row.minClientCapability,
        ),
        characterIds: characterIds(row.characterIds),
        assetManifestHash: text(
          'asset manifest hash',
          row.assetManifestHash,
        ),
        cueSchemaVersion: text(
          'cue schema version',
          row.cueSchemaVersion,
        ),
      });
    } catch (error) {
      return mapError(error);
    }
  }
}

export function createPostgresContentBundleManifestReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ContentBundleManifestReadAuthorityPortV1 {
  return new PostgresContentBundleManifestReadAuthorityPortV1(client);
}
