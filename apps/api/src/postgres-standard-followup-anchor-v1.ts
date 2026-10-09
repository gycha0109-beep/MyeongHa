import type {
  ValidatedStandardFollowupAnchorAuthorityPortV1,
  ValidatedStandardFollowupAnchorV1,
} from './character-standard-reading-chat-followup-evidence-v1.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

/**
 * DB-owner delivery contract, NOT a deployed function.
 *
 * The DB track must implement this security-definer query with subject-context
 * assertion, exact current Reader Grant/Product/Thread/Reading recheck and a
 * committed assistant attempt joined to a passing Semantic AND Output Guard.
 *
 * Existing Se-yeon generated/validated grounding_refs_jsonb are UUID execution
 * refs (currently []), NOT official Saju grounding_unit_* identifiers. Never
 * reinterpret them as sourceUnitRefs.
 */
export const POSTGRES_STANDARD_FOLLOWUP_ANCHOR_BINDING_V1 =
  'public.qry_official_reader_followup_anchor_runtime_v1' as const;

type AnchorRowV1 = Readonly<{
  status: unknown;
  subjectId: unknown;
  threadId: unknown;
  readerCharacterId: unknown;
  readingRef: unknown;
  officialArtifactResponseHash: unknown;
  groundingHash: unknown;
  assistantMessageId: unknown;
  sourceUnitRefs: unknown;
  focusedUnitRef: unknown;
}>;

const READ_SQL = `
select
  status,
  subject_id::text as "subjectId",
  thread_id::text as "threadId",
  reader_character_id as "readerCharacterId",
  reading_ref::text as "readingRef",
  official_artifact_response_hash as "officialArtifactResponseHash",
  grounding_hash as "groundingHash",
  assistant_message_id::text as "assistantMessageId",
  source_unit_refs as "sourceUnitRefs",
  focused_unit_ref as "focusedUnitRef"
from public.qry_official_reader_followup_anchor_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::uuid
)
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const GROUNDING_HASH = /^[0-9a-f]{64}$/u;
const UNIT_ID = /^grounding_unit_[0-9a-f]{24}$/u;
const ARTIFACT_HASH = /^sha256:v1:[0-9a-f]{64}$/u;

export class PostgresStandardFollowupAnchorErrorV1 extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'ACCESS_DENIED' | 'INVALID_PROVENANCE') {
    super('PostgreSQL Official Reader follow-up evidence is unavailable.');
    this.name = 'PostgresStandardFollowupAnchorErrorV1';
  }
}

function deny(code: PostgresStandardFollowupAnchorErrorV1['code']): never {
  throw new PostgresStandardFollowupAnchorErrorV1(code);
}

function validText(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= maxLength && value.trim() === value;
}

function validateInput(input: Parameters<
  ValidatedStandardFollowupAnchorAuthorityPortV1['readLatestValidatedAnchor']
>[0]): void {
  if (!UUID.test(input.subjectId) || !UUID.test(input.threadId) ||
      !UUID.test(input.readingRef) || !validText(input.readerCharacterId)) {
    deny('INVALID_INPUT');
  }
}

function assertAnchor(
  row: AnchorRowV1,
  scope: Parameters<
    ValidatedStandardFollowupAnchorAuthorityPortV1['readLatestValidatedAnchor']
  >[0],
): ValidatedStandardFollowupAnchorV1 {
  if (row.status !== 'committed_semantic_guard_pass' ||
      row.subjectId !== scope.subjectId || row.threadId !== scope.threadId ||
      row.readerCharacterId !== scope.readerCharacterId ||
      row.readingRef !== scope.readingRef ||
      !validText(row.officialArtifactResponseHash, 256) ||
      !ARTIFACT_HASH.test(row.officialArtifactResponseHash) ||
      !validText(row.groundingHash, 64) ||
      !GROUNDING_HASH.test(row.groundingHash) ||
      !validText(row.assistantMessageId, 36) ||
      !UUID.test(row.assistantMessageId) ||
      !Array.isArray(row.sourceUnitRefs) ||
      row.sourceUnitRefs.length === 0 ||
      row.sourceUnitRefs.length > 12 ||
      row.sourceUnitRefs.some(v => !validText(v, 39) || !UNIT_ID.test(v)) ||
      new Set(row.sourceUnitRefs).size !== row.sourceUnitRefs.length ||
      (row.focusedUnitRef !== null && row.focusedUnitRef !== undefined &&
        (!validText(row.focusedUnitRef, 39) ||
          !row.sourceUnitRefs.includes(row.focusedUnitRef)))) {
    deny('INVALID_PROVENANCE');
  }

  const refs: readonly string[] = Object.freeze([...row.sourceUnitRefs] as string[]);
  return Object.freeze({
    status: 'committed_semantic_guard_pass',
    subjectId: scope.subjectId,
    threadId: scope.threadId,
    readerCharacterId: scope.readerCharacterId,
    readingRef: scope.readingRef,
    officialArtifactResponseHash: row.officialArtifactResponseHash,
    groundingHash: row.groundingHash,
    assistantMessageId: row.assistantMessageId,
    sourceUnitRefs: refs,
    ...(row.focusedUnitRef === null || row.focusedUnitRef === undefined
      ? {}
      : { focusedUnitRef: row.focusedUnitRef }),
  });
}

/**
 * Transaction-scoped, read-only adapter. Instantiation does not call the DB.
 * A missing function, permission refusal, malformed row or any transient DB
 * error MUST block follow-up evidence; never use transcript/LLM substitutes.
 */
export function createPostgresStandardFollowupAnchorAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): ValidatedStandardFollowupAnchorAuthorityPortV1 {
  return Object.freeze({
    async readLatestValidatedAnchor(scope) {
      validateInput(scope);
      let rows: readonly AnchorRowV1[];
      try {
        const result = await client.query<AnchorRowV1>(READ_SQL, [
          scope.subjectId, scope.threadId, scope.readerCharacterId, scope.readingRef,
        ]);
        rows = result.rows;
      } catch {
        return deny('ACCESS_DENIED');
      }
      if (rows.length > 1) return deny('INVALID_PROVENANCE');
      if (rows.length === 0) return null;
      return assertAnchor(rows[0]!, scope);
    },
  });
}
