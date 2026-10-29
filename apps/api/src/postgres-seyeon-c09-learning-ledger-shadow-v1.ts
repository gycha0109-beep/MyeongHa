import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import type {
  SeyeonC09ApprovedLearningReadAuthorityV1,
  SeyeonC09ServerTurnTopicV1,
} from './seyeon-c09-epistemic-authority-shadow-v1.js';
import type {
  SeyeonC09KnowledgeEvidenceShadowV1,
  SeyeonC09KnowledgePolicyShadowV1,
} from '../../../packages/domain/src/seyeon-c09-epistemic-resolver-shadow-v1.js';

export const POSTGRES_SEYEON_C09_LEARNING_LEDGER_READ_SHADOW_VERSION_V1 =
  'postgres-seyeon-c09-learning-ledger-read-shadow-v1' as const;

/**
 * SQL is deliberately prepared against a proposed, NOT DEPLOYED schema.
 * No shadow endpoint attaches it to Production. A missing relation or missing
 * RLS/role privilege must reject access; this module never grants authority.
 */
export const POSTGRES_SEYEON_C09_KNOWLEDGE_TOPIC_SQL_V1 = [
  'select character_id as "characterId", topic_key as "topicKey",',
  ' policy_version as "policyVersion", authority_source_ref as "authoritySourceRef",',
  ' domain_policy as "domainPolicy", baseline as "baseline"',
  'from myeongha_internal.character_knowledge_topics_v1',
  'where character_id = $1::text and topic_key = $2::text',
  ' and published_at is not null and revoked_at is null',
].join('\n');

export const POSTGRES_SEYEON_C09_LEARNING_HISTORY_SQL_V1 = [
  'select id::text as "evidenceId", character_id as "characterId",',
  ' topic_key as "topicKey", source_kind as "sourceKind",',
  ' authority_ref as "authorityRef", awareness as "awareness",',
  ' visibility as "visibility",',
  ' case when visibility = \'user_private\' then subject_id::text else null end as "subjectId",',
  ' approved_for_character_sharing as "approvedForCharacterSharing",',
  ' privacy_reviewed_at is not null as "privacyReviewed",',
  ' learned_at as "learnedAt", valid_at as "validAt",',
  ' superseded_at as "supersededAt",',
  ' verified_at as "verifiedAt", approval_ref as "approvalRef",',
  ' privacy_review_ref as "privacyReviewRef"',
  'from myeongha_internal.character_learning_evidence_v1',
  'where character_id = $1::text and topic_key = $2::text',
  ' and ((visibility = \'character_shared\' and subject_id is null',
  '        and approved_for_character_sharing = true and privacy_reviewed_at is not null)',
  '   or (visibility = \'user_private\' and subject_id = $3::uuid',
  '       and approved_for_character_sharing = false))',
  ' and verified_at <= $4::timestamptz and valid_at <= $4::timestamptz',
  ' and learned_at <= $4::timestamptz',
  ' and (superseded_at is null or superseded_at > $4::timestamptz)',
  ' and (revoked_at is null or revoked_at > $4::timestamptz)',
  'order by valid_at desc, id asc limit 65',
].join('\n');

export const POSTGRES_SEYEON_C09_LEARNING_VERIFY_SQL_V1 = [
  'select id::text as "evidenceId", authority_ref as "authorityRef",',
  ' character_id as "characterId", topic_key as "topicKey",',
  ' source_kind as "sourceKind", awareness as "awareness",',
  ' visibility as "visibility", subject_id::text as "sourceSubjectId",',
  ' approved_for_character_sharing as "approvedForCharacterSharing",',
  ' privacy_reviewed_at is not null as "privacyReviewed",',
  ' approval_ref as "approvalRef", privacy_review_ref as "privacyReviewRef",',
  ' verified_at as "verifiedAt", valid_at as "validAt",',
  ' learned_at as "learnedAt", superseded_at as "supersededAt",',
  ' revoked_at as "revokedAt"',
  'from myeongha_internal.character_learning_evidence_v1',
  'where id = $1::uuid and character_id = $2::text and topic_key = $3::text',
  ' and authority_ref = $4::text',
].join('\n');

type Row = Readonly<Record<string, unknown>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const SOURCES = ['canon', 'approved_character_fact', 'user_taught_verified', 'public_verified', 'experience'] as const;
const LEVELS = ['heard_of', 'basic', 'practiced', 'proficient'] as const;

export class SeyeonC09LearningLedgerReadHoldV1 extends Error {
  readonly code = 'C09_LEARNING_LEDGER_UNAVAILABLE' as const;
  constructor() {
    super('Character learning ledger authority is not deployed or cannot be verified.');
    this.name = 'SeyeonC09LearningLedgerReadHoldV1';
  }
}
const hold = (): never => { throw new SeyeonC09LearningLedgerReadHoldV1(); };

function timestamp(value: unknown): string {
  if (value instanceof Date) value = value.toISOString();
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) hold();
  const date = new Date(value as string);
  return date.toISOString();
}
function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function bounded(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= max && value === value.trim();
}

function checkEvidence(row: Row, subjectId: string, asOfTurn: string): SeyeonC09KnowledgeEvidenceShadowV1 {
  const vis = row.visibility;
  if (!id(row.evidenceId) || row.characterId !== 'seyeon' ||
      !TOPIC.test(String(row.topicKey)) || !SOURCES.includes(row.sourceKind as typeof SOURCES[number]) ||
      !LEVELS.includes(row.awareness as typeof LEVELS[number]) ||
      !bounded(row.authorityRef) || !bounded(row.approvalRef) ||
      !bounded(row.privacyReviewRef) && vis === 'character_shared' ||
      !['character_shared', 'user_private'].includes(vis as string) ||
      row.approvedForCharacterSharing !== (vis === 'character_shared') ||
      row.privacyReviewed !== (vis === 'character_shared') && vis === 'character_shared' ||
      (vis === 'character_shared' ? row.subjectId !== null : row.subjectId !== subjectId)) hold();

  const learnedAt = timestamp(row.learnedAt);
  const validAt = timestamp(row.validAt);
  const verifiedAt = timestamp(row.verifiedAt);
  const supersededAt = nullableTimestamp(row.supersededAt);
  const at = Date.parse(asOfTurn);
  if (!Number.isFinite(at) || Date.parse(learnedAt) > at ||
      Date.parse(validAt) > at || Date.parse(verifiedAt) > at ||
      (supersededAt !== null && Date.parse(supersededAt) <= at)) hold();
  return Object.freeze({
    evidenceId: row.evidenceId as string,
    characterId: 'seyeon' as const,
    topicKey: row.topicKey as string,
    sourceKind: row.sourceKind as SeyeonC09KnowledgeEvidenceShadowV1['sourceKind'],
    authorityRef: row.authorityRef as string,
    verifiedByServer: true as const,
    awareness: row.awareness as SeyeonC09KnowledgeEvidenceShadowV1['awareness'],
    visibility: vis as 'character_shared' | 'user_private',
    subjectId: vis === 'character_shared' ? null : subjectId,
    approvedForCharacterSharing: vis === 'character_shared',
    privacyReviewed: row.privacyReviewed === true,
    learnedAt,
    validAt,
    supersededAt,
  });
}

export function createPostgresSeyeonC09LearningLedgerReaderShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>): Pick<SeyeonC09ApprovedLearningReadAuthorityV1,
  'readAuthoritativeTopicPolicy' | 'readVerifiedLearningHistory' | 'verifyLearningEvidence'> {
  const client = input?.scope?.client;
  const subjectId = input?.scope?.resolvedSubject?.subjectId;
  if (!id(subjectId) || !client || typeof client.query !== 'function') hold();

  return Object.freeze({
    async readAuthoritativeTopicPolicy(request) {
      if (request.characterId !== 'seyeon' || !TOPIC.test(request.topicKey)) hold();
      try {
        const result = await client.query<Row>(
          POSTGRES_SEYEON_C09_KNOWLEDGE_TOPIC_SQL_V1,
          ['seyeon', request.topicKey],
        );
        if (result.rows.length !== 1) return null;
        const row = result.rows[0]!;
        if (row.characterId !== 'seyeon' || row.topicKey !== request.topicKey ||
            !bounded(row.policyVersion) || !bounded(row.authoritySourceRef) ||
            !['ambient', 'bounded', 'authority_only'].includes(row.domainPolicy as string) ||
            !['not_recorded','explicit_unaware','heard_of','basic','practiced','proficient'].includes(row.baseline as string)) hold();
        return Object.freeze(row as unknown as SeyeonC09KnowledgePolicyShadowV1);
      } catch { return hold(); }
    },
    async readVerifiedLearningHistory(request) {
      if (request.characterId !== 'seyeon' || !TOPIC.test(request.topicKey) ||
          request.subjectId !== subjectId || !Number.isFinite(Date.parse(request.asOfTurn))) hold();
      try {
        const result = await client.query<Row>(
          POSTGRES_SEYEON_C09_LEARNING_HISTORY_SQL_V1,
          ['seyeon', request.topicKey, subjectId, request.asOfTurn],
        );
        if (result.rows.length > 64) hold();
        const ids = new Set<string>();
        return Object.freeze(result.rows.map(row => {
          const e = checkEvidence(row, subjectId, request.asOfTurn);
          if (e.topicKey !== request.topicKey || ids.has(e.evidenceId)) hold();
          ids.add(e.evidenceId);
          return e;
        }));
      } catch { return hold(); }
    },
    async verifyLearningEvidence(request) {
      const expected = request.expectedEvidence;
      if (request.characterId !== 'seyeon' || request.subjectId !== subjectId ||
          !TOPIC.test(request.topicKey) || !id(request.evidenceId) ||
          !bounded(request.authorityRef) || !Number.isFinite(Date.parse(request.asOfTurn)) ||
          !expected || expected.characterId !== 'seyeon' ||
          expected.topicKey !== request.topicKey || expected.evidenceId !== request.evidenceId ||
          expected.authorityRef !== request.authorityRef || expected.verifiedByServer !== true ||
          (expected.visibility === 'user_private' && expected.subjectId !== subjectId)) hold();
      try {
        const result = await client.query<Row>(
          POSTGRES_SEYEON_C09_LEARNING_VERIFY_SQL_V1,
          [request.evidenceId, 'seyeon', request.topicKey, request.authorityRef],
        );
        if (result.rows.length !== 1) return false;
        const row = result.rows[0]!;
        if (row.evidenceId !== request.evidenceId || row.authorityRef !== request.authorityRef ||
            row.characterId !== 'seyeon' || row.topicKey !== request.topicKey ||
            row.revokedAt !== null) return false;
        let current: SeyeonC09KnowledgeEvidenceShadowV1;
        try {
          current = checkEvidence({
            ...row,
            subjectId: row.sourceSubjectId,
          }, subjectId, request.asOfTurn);
        } catch {
          return false;
        }
        return JSON.stringify(current) === JSON.stringify(expected);
      } catch { return hold(); }
    },
  });
}


/**
 * Bind a separately implemented, server-governed turn/topic classifier to
 * the read-only PostgreSQL ledger. The source classifier is mandatory; model
 * output or a client-supplied topic must never be treated as Canon authority.
 */
export function createPostgresSeyeonC09ApprovedLearningAuthorityShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  readServerClassifiedTurn: (request: Readonly<{
    subjectId: string;
    currentUserMessageId: string;
  }>) => Promise<SeyeonC09ServerTurnTopicV1>;
}>): SeyeonC09ApprovedLearningReadAuthorityV1 {
  const subjectId = input?.scope?.resolvedSubject?.subjectId;
  if (!id(subjectId) || typeof input.readServerClassifiedTurn !== 'function') hold();
  const reader = createPostgresSeyeonC09LearningLedgerReaderShadowV1({
    scope: input.scope,
  });
  return Object.freeze({
    async readServerClassifiedTurn(request: Readonly<{
      subjectId: string;
      currentUserMessageId: string;
    }>) {
      if (request.subjectId !== subjectId ||
          !bounded(request.currentUserMessageId)) hold();
      try {
        const turn = await input.readServerClassifiedTurn({
          subjectId,
          currentUserMessageId: request.currentUserMessageId,
        });
        if (turn.subjectId !== subjectId ||
            turn.currentUserMessageId !== request.currentUserMessageId) hold();
        return turn;
      } catch { return hold(); }
    },
    ...reader,
  });
}
