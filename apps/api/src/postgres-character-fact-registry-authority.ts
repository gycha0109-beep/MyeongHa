import {
  CharacterFactRegistryAuthorityErrorV1,
  type CharacterFactRegistryAuthorityRowV1,
  type CharacterFactRegistryReadAuthorityPortV1,
} from './character-fact-registry-authority.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

type CharacterFactQueryRowV1 = Readonly<{
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

const READ_CHARACTER_FACT_SQL = `
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
from public.qry_character_fact_registry_v1(
  $1::uuid,
  $2::text,
  $3::text
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character fact registry PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Character fact registry PostgreSQL ${name} is invalid.`);
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
    case 'qry_character_fact_registry_input_required':
      throw new CharacterFactRegistryAuthorityErrorV1(
        'INVALID_SELECTOR',
        'Character fact registry lookup input was rejected.',
      );
    case 'qry_character_fact_registry_release_unavailable':
      throw new CharacterFactRegistryAuthorityErrorV1(
        'FACT_NOT_FOUND',
        'Character fact registry release authority is unavailable.',
      );
    default:
      throw error;
  }
}

function mapRow(row: CharacterFactQueryRowV1): CharacterFactRegistryAuthorityRowV1 {
  const sourceAuthority = requireString('source authority', row.sourceAuthority);
  if (
    ![
      'CANON',
      'SOFT_CANON',
      'AUTHOR_UNDEFINED',
      'INTENTIONALLY_OPEN',
      'WORLD_DEPENDENT',
    ].includes(sourceAuthority)
  ) {
    throw new Error('Character fact registry PostgreSQL source authority is invalid.');
  }

  const characterKnowledge = requireString('character knowledge', row.characterKnowledge);
  if (
    !['KNOWN', 'PARTIAL', 'UNKNOWN_TO_CHARACTER', 'NOT_APPLICABLE'].includes(
      characterKnowledge,
    )
  ) {
    throw new Error('Character fact registry PostgreSQL character knowledge is invalid.');
  }

  const disclosureDefault = requireString('disclosure default', row.disclosureDefault);
  if (
    ![
      'PUBLIC',
      'FAMILIAR',
      'ATTACHED',
      'DEEP_TRUST',
      'CONTEXTUAL',
      'NEVER',
      'NOT_APPLICABLE',
    ].includes(disclosureDefault)
  ) {
    throw new Error('Character fact registry PostgreSQL disclosure default is invalid.');
  }

  const hasValue = requireBoolean('has value', row.hasValue);
  const policy = optionalString('policy', row.policy);
  const closureNote = optionalString('closure note', row.closureNote);

  return Object.freeze({
    releaseId: requireString('release id', row.releaseId),
    characterId: requireString('Character id', row.characterId),
    factKey: requireString('fact key', row.factKey),
    sourceAuthority:
      sourceAuthority as CharacterFactRegistryAuthorityRowV1['sourceAuthority'],
    characterKnowledge:
      characterKnowledge as CharacterFactRegistryAuthorityRowV1['characterKnowledge'],
    disclosureDefault:
      disclosureDefault as CharacterFactRegistryAuthorityRowV1['disclosureDefault'],
    sourceSection: requireString('source section', row.sourceSection),
    sourceBibleDocument: requireString(
      'source Bible document',
      row.sourceBibleDocument,
    ),
    sourceBibleRevision: requireString(
      'source Bible revision',
      row.sourceBibleRevision,
    ),
    ...(hasValue ? { value: row.value } : {}),
    ...(policy === undefined ? {} : { policy }),
    ...(closureNote === undefined ? {} : { closureNote }),
  });
}

class PostgresCharacterFactRegistryReadAuthorityPortV1
implements CharacterFactRegistryReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readFact(
    input: Parameters<CharacterFactRegistryReadAuthorityPortV1['readFact']>[0],
  ): Promise<CharacterFactRegistryAuthorityRowV1 | null> {
    try {
      const result = await this.client.query<CharacterFactQueryRowV1>(
        READ_CHARACTER_FACT_SQL,
        [input.releaseId, input.characterId, input.factKey],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1 || result.rows[0] === undefined) {
        throw new Error(
          'Character fact registry PostgreSQL authority returned multiple rows.',
        );
      }
      return mapRow(result.rows[0]);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

export function createPostgresCharacterFactRegistryReadAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): CharacterFactRegistryReadAuthorityPortV1 {
  return new PostgresCharacterFactRegistryReadAuthorityPortV1(client);
}
