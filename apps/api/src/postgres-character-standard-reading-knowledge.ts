import {
  CHARACTER_STANDARD_READING_ACCESS_AUTHORITY_BINDING_V1,
  CHARACTER_STANDARD_READING_ARTIFACT_SOURCE_AUTHORITY_BINDING_V1,
  CharacterStandardReadingKnowledgeAuthorityPortErrorV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingAccessAuthorityRowV1,
  type CharacterStandardReadingArtifactAuthorityPortV1,
  type CharacterStandardReadingArtifactAuthorityRowV1,
} from './character-standard-reading-knowledge.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export {
  CHARACTER_STANDARD_READING_ACCESS_AUTHORITY_BINDING_V1,
  CHARACTER_STANDARD_READING_ARTIFACT_SOURCE_AUTHORITY_BINDING_V1,
};

type AccessQueryRowV1 = Readonly<{
  readingId: unknown;
  readingSessionId: unknown;
  productId: unknown;
  topicKey: unknown;
  sajuDomain: unknown;
  readingPeriod: unknown;
  readingVariant: unknown;
  sourceBirthRevisionId: unknown;
  productSpecVersion: unknown;
  domainCapabilityVersion: unknown;
  readingContractVersion: unknown;
  sajuEngineVersion: unknown;
  responseHash: unknown;
}>;

type ArtifactQueryRowV1 = Readonly<{
  readingId: unknown;
  productId: unknown;
  readerCharacterId: unknown;
  readingContractVersion: unknown;
  productResponseState: unknown;
  responseSnapshotJsonb: unknown;
  responseHash: unknown;
  completedAt: unknown;
}>;

const ACCESS_SQL = `
select
  reading_id::text as "readingId",
  reading_session_id::text as "readingSessionId",
  product_id::text as "productId",
  topic_key as "topicKey",
  saju_domain as "sajuDomain",
  reading_period as "readingPeriod",
  reading_variant as "readingVariant",
  source_birth_revision_id::text as "sourceBirthRevisionId",
  product_spec_version as "productSpecVersion",
  domain_capability_version as "domainCapabilityVersion",
  reading_contract_version as "readingContractVersion",
  saju_engine_version as "sajuEngineVersion",
  response_hash as "responseHash"
from public.qry_character_standard_reading_access_runtime_v1(
  $1::uuid,
  $2::text,
  $3::timestamptz
)
`.trim();

const ARTIFACT_SQL = `
select
  reading_id::text as "readingId",
  product_id::text as "productId",
  reader_character_id as "readerCharacterId",
  reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",
  response_snapshot_jsonb as "responseSnapshotJsonb",
  response_hash as "responseHash",
  completed_at::text as "completedAt"
from public.qry_standard_reading_artifact_source_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::timestamptz
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Character Standard Reading PostgreSQL ${name} is invalid.`);
  }
  return value.trim();
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function fail(
  code: ConstructorParameters<typeof CharacterStandardReadingKnowledgeAuthorityPortErrorV1>[0],
  message: string,
): never {
  throw new CharacterStandardReadingKnowledgeAuthorityPortErrorV1(code, message);
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'internal_character_standard_reading_access_input_required':
    case 'internal_standard_reading_artifact_source_v2_input_required':
      return fail('INVALID_INPUT', 'Character Standard Reading authority input was rejected.');
    case 'member_subject_context_unresolved':
    case 'guest_subject_context_unresolved':
    case 'myeongha_subject_context_required':
    case 'myeongha_subject_context_mismatch':
      return fail('SUBJECT_INELIGIBLE', 'Character Standard Reading subject is unavailable.');
    default:
      throw error;
  }
}

function mapAccessRows(
  rows: readonly AccessQueryRowV1[],
): readonly CharacterStandardReadingAccessAuthorityRowV1[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    readingId: requireString('Reading id', row.readingId),
    readingSessionId: requireString('Reading Session id', row.readingSessionId),
    productId: requireString('Product id', row.productId),
    topicKey: requireString('topic key', row.topicKey),
    sajuDomain: requireString('Saju domain', row.sajuDomain),
    readingPeriod: requireString('reading period', row.readingPeriod),
    readingVariant: requireString('reading variant', row.readingVariant),
    sourceBirthRevisionId: requireString('source Birth revision id', row.sourceBirthRevisionId),
    productSpecVersion: requireString('Product spec version', row.productSpecVersion),
    domainCapabilityVersion: requireString('domain capability version', row.domainCapabilityVersion),
    readingContractVersion: requireString('Reading contract version', row.readingContractVersion),
    sajuEngineVersion: requireString('Saju engine version', row.sajuEngineVersion),
    responseHash: requireString('response hash', row.responseHash),
  })));
}

function mapArtifactRows(
  rows: readonly ArtifactQueryRowV1[],
): readonly CharacterStandardReadingArtifactAuthorityRowV1[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    readingId: requireString('artifact Reading id', row.readingId),
    productId: requireString('artifact Product id', row.productId),
    readerCharacterId: requireString('artifact Reader Character id', row.readerCharacterId),
    readingContractVersion: requireString(
      'artifact Reading contract version',
      row.readingContractVersion,
    ),
    productResponseState: requireString('Product response state', row.productResponseState),
    responseSnapshotJsonb: row.responseSnapshotJsonb,
    responseHash: requireString('artifact response hash', row.responseHash),
    completedAt: requireString('completed timestamp', row.completedAt),
  })));
}

class PostgresCharacterStandardReadingKnowledgePortsV1
implements CharacterStandardReadingAccessAuthorityPortV1, CharacterStandardReadingArtifactAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readAccessibleReadings(
    input: Parameters<CharacterStandardReadingAccessAuthorityPortV1['readAccessibleReadings']>[0],
  ): Promise<readonly CharacterStandardReadingAccessAuthorityRowV1[]> {
    try {
      const result = await this.client.query<AccessQueryRowV1>(ACCESS_SQL, [
        input.subjectId,
        input.readerCharacterId,
        input.effectiveAt,
      ]);
      return mapAccessRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }

  async readArtifactSource(
    input: Parameters<CharacterStandardReadingArtifactAuthorityPortV1['readArtifactSource']>[0],
  ): Promise<readonly CharacterStandardReadingArtifactAuthorityRowV1[]> {
    try {
      const result = await this.client.query<ArtifactQueryRowV1>(ARTIFACT_SQL, [
        input.subjectId,
        input.readingId,
        input.readerCharacterId,
        input.effectiveAt,
      ]);
      return mapArtifactRows(result.rows);
    } catch (error) {
      return mapPostgresError(error);
    }
  }
}

/**
 * Production server adapter. Migration 1240 exposes only the two transaction-
 * subject-bound SECURITY DEFINER runtime wrappers to myeongha_api_executor.
 * The migration-1220 INTERNAL source functions and raw authority tables remain
 * ungranted to ordinary runtime roles.
 */
export function createPostgresCharacterStandardReadingKnowledgePortsV1(
  client: PostgresTransactionQueryV1,
): Readonly<{
  accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
}> {
  const ports = new PostgresCharacterStandardReadingKnowledgePortsV1(client);
  return Object.freeze({
    accessAuthorityPort: ports,
    artifactAuthorityPort: ports,
  });
}
