import {
  CharacterPublicFactCatalogAuthorityErrorV1,
  type CharacterPublicFactCatalogReadAuthorityPortV1,
} from './character-public-fact-catalog-authority.js';
import type {
  CharacterFactRegistryAuthorityRowV1,
} from './character-fact-registry-authority.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type CharacterPublicFactCatalogQueryRowV1 = Readonly<{
  releaseId: unknown;
  characterId: unknown;
  factKey: unknown;
  sourceAuthority: unknown;
  characterKnowledge: unknown;
  disclosureDefault: unknown;
  sourceSection: unknown;
  sourceBibleDocument: unknown;
  sourceBibleRevision: unknown;
  value: unknown;
  hasValue: unknown;
  policy: unknown;
  closureNote: unknown;
}>;

const READ_PUBLIC_FACT_CATALOG_SQL = `
select
  release_id::text as "releaseId",
  character_id as "characterId",
  fact_key as "factKey",
  source_authority as "sourceAuthority",
  character_knowledge as "characterKnowledge",
  disclosure_default as "disclosureDefault",
  source_section as "sourceSection",
  source_bible_document as "sourceBibleDocument",
  source_bible_revision as "sourceBibleRevision",
  value_jsonb as "value",
  has_value as "hasValue",
  policy,
  closure_note as "closureNote"
from public.qry_character_public_fact_catalog_v1(
  $1::uuid,
  $2::text
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character PUBLIC fact catalog PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Character PUBLIC fact catalog PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function optionalString(name: string, value: unknown): string | undefined {
  if (value === null) return undefined;
  return requireString(name, value);
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_character_public_fact_catalog_input_required':
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'INVALID_SELECTOR',
        'PUBLIC Character fact catalog lookup input was rejected.',
      );
    case 'qry_character_public_fact_catalog_release_unavailable':
    case 'qry_character_public_fact_catalog_character_unavailable':
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'PROVENANCE_MISMATCH',
        'PUBLIC Character fact catalog release / Character authority is unavailable.',
      );
    case 'qry_character_public_fact_catalog_too_large':
      throw new CharacterPublicFactCatalogAuthorityErrorV1(
        'CATALOG_TOO_LARGE',
        'PUBLIC Character fact catalog exceeds the v1 bound.',
      );
    default:
      throw error;
  }
}

function mapRow(
  row: CharacterPublicFactCatalogQueryRowV1,
): CharacterFactRegistryAuthorityRowV1 {
  const sourceAuthority = requireString('source authority', row.sourceAuthority);
  if (sourceAuthority !== 'CANON' && sourceAuthority !== 'SOFT_CANON') {
    throw new Error(
      'Character PUBLIC fact catalog PostgreSQL source authority is invalid.',
    );
  }

  const characterKnowledge = requireString(
    'character knowledge',
    row.characterKnowledge,
  );
  if (characterKnowledge !== 'KNOWN') {
    throw new Error(
      'Character PUBLIC fact catalog PostgreSQL character knowledge is invalid.',
    );
  }

  const disclosureDefault = requireString(
    'disclosure default',
    row.disclosureDefault,
  );
  if (disclosureDefault !== 'PUBLIC') {
    throw new Error(
      'Character PUBLIC fact catalog PostgreSQL disclosure default is invalid.',
    );
  }

  const hasValue = requireBoolean('has value', row.hasValue);
  if (!hasValue) {
    throw new Error(
      'Character PUBLIC fact catalog PostgreSQL row is missing a resolved value.',
    );
  }

  const policy = optionalString('policy', row.policy);
  const closureNote = optionalString('closure note', row.closureNote);

  return Object.freeze({
    releaseId: requireString('release id', row.releaseId),
    characterId: requireString('Character id', row.characterId),
    factKey: requireString('fact key', row.factKey),
    sourceAuthority,
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'PUBLIC',
    sourceSection: requireString('source section', row.sourceSection),
    sourceBibleDocument: requireString(
      'source Bible document',
      row.sourceBibleDocument,
    ),
    sourceBibleRevision: requireString(
      'source Bible revision',
      row.sourceBibleRevision,
    ),
    value: row.value,
    ...(policy === undefined ? {} : { policy }),
    ...(closureNote === undefined ? {} : { closureNote }),
  });
}

class PostgresCharacterPublicFactCatalogReadAuthorityPortV1
implements CharacterPublicFactCatalogReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readPublicFacts(
    input: Parameters<CharacterPublicFactCatalogReadAuthorityPortV1['readPublicFacts']>[0],
  ): Promise<readonly CharacterFactRegistryAuthorityRowV1[]> {
    try {
      const result = await this.client.query<CharacterPublicFactCatalogQueryRowV1>(
        READ_PUBLIC_FACT_CATALOG_SQL,
        [input.releaseId, input.characterId],
      );
      return Object.freeze(result.rows.map(mapRow));
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresCharacterPublicFactCatalogReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): CharacterPublicFactCatalogReadAuthorityPortV1 {
  return new PostgresCharacterPublicFactCatalogReadAuthorityPortV1(client);
}
