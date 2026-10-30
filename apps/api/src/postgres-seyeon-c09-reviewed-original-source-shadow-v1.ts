import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import type {
  C09ReviewedOriginalSourceAuthorityShadowV1,
} from './seyeon-c09-reviewed-original-topic-authority-shadow-v1.js';

export const C09_POSTGRES_REVIEWED_ORIGINAL_SQL_V1 = [
  'select review_ref as "reviewRef",',
  ' owner_subject_id::text as "subjectId",',
  ' original_message_id::text as "originalMessageId",',
  ' original_content_hash as "originalContentHash",',
  ' character_id as "characterId",topic_key as "topicKey",',
  ' awareness,visibility,state as "status",',
  ' reviewer_ref as "reviewerRef",review_policy_ref as "reviewPolicyRef",',
  ' learned_at as "learnedAt",valid_at as "validAt",',
  ' reviewed_at as "reviewedAt",revoked_at as "revokedAt"',
  'from myeongha_internal.character_learning_original_reviews_v1',
  'where owner_subject_id=$1::uuid and original_message_id=$2::uuid',
  ' and original_content_hash=$3::text',
  " and character_id='seyeon' and visibility='user_private'",
  " and state='approved' and revoked_at is null",
  ' and reviewed_at<=clock_timestamp()',
].join('\n');

export const C09_REVIEWED_ORIGINAL_DB_SHADOW_VERSION_V1 =
  'postgres-seyeon-c09-reviewed-original-source-shadow-v1' as const;

export class C09PostgresReviewedOriginalHoldV1 extends Error {
  readonly code = 'C09_INDEPENDENT_ORIGINAL_REVIEW_UNAVAILABLE' as const;
  constructor() {
    super('Independent original review authority is unavailable or not current.');
    this.name = 'C09PostgresReviewedOriginalHoldV1';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const AWARENESS = ['heard_of', 'basic', 'practiced', 'proficient'] as const;
const fail = (): never => { throw new C09PostgresReviewedOriginalHoldV1(); };

function bounded(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 512 && value === value.trim();
}
function toIso(value: unknown): string {
  const v = value instanceof Date ? value.toISOString() : value;
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) fail();
  const date = new Date(v as string);
  if (date.getTime() > Date.now()) fail();
  return date.toISOString();
}

/**
 * Read-only, Subject-bound independent review source for the NOT-DEPLOYED
 * C09 review proposal. The command's independently verified user action
 * remains a separate opt-in: this row only authorizes a reviewed topic.
 *
 * The DB role must have its normal RLS SELECT privilege. There is no raw SQL
 * fallback, REVIEWER grant, SECURITY DEFINER path, or public HTTP mount.
 * Failures are deliberately generic, including absent schema / denied ACL.
 */
export function createPostgresC09ReviewedOriginalSourceShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>): C09ReviewedOriginalSourceAuthorityShadowV1 {
  const subject = input?.scope?.resolvedSubject;
  const query = input?.scope?.client?.query?.bind(input.scope.client);
  if (!subject || subject.subjectKind !== 'member' ||
      !UUID.test(subject.subjectId) || !query) fail();

  const subjectId = subject.subjectId;

  return Object.freeze({
    async readIndependentlyApprovedOriginal(request: Parameters<C09ReviewedOriginalSourceAuthorityShadowV1['readIndependentlyApprovedOriginal']>[0]) {
      if (!request || request.subjectId !== subjectId ||
          !UUID.test(request.originalMessageId) ||
          !bounded(request.originalContentHash)) fail();
      try {
        const r = await query<Record<string, unknown>>(
          C09_POSTGRES_REVIEWED_ORIGINAL_SQL_V1,
          [subjectId, request.originalMessageId, request.originalContentHash],
        );
        if (r.rows.length !== 1) fail();
        const row = r.rows[0]!;
        if (row.subjectId !== subjectId ||
            row.originalMessageId !== request.originalMessageId ||
            row.originalContentHash !== request.originalContentHash ||
            row.characterId !== 'seyeon' ||
            row.visibility !== 'user_private' ||
            row.status !== 'approved' ||
            row.revokedAt !== null ||
            !bounded(row.reviewRef) ||
            !bounded(row.reviewerRef) ||
            !bounded(row.reviewPolicyRef) ||
            typeof row.topicKey !== 'string' || !TOPIC.test(row.topicKey) ||
            !AWARENESS.includes(row.awareness as typeof AWARENESS[number])) fail();

        const learnedAt = toIso(row.learnedAt);
        const validAt = toIso(row.validAt);
        const reviewedAt = toIso(row.reviewedAt);
        if (Date.parse(learnedAt) > Date.parse(validAt) ||
            Date.parse(validAt) > Date.parse(reviewedAt)) fail();

        return Object.freeze({
          status: 'approved' as const,
          characterId: 'seyeon' as const,
          visibility: 'user_private' as const,
          subjectId,
          originalMessageId: request.originalMessageId,
          originalContentHash: request.originalContentHash,
          reviewRef: row.reviewRef,
          reviewerRef: row.reviewerRef,
          reviewPolicyRef: row.reviewPolicyRef,
          topicKey: row.topicKey,
          awareness: row.awareness,
          learnedAt,
          validAt,
          reviewedAt,
        });
      } catch {
        return fail();
      }
    },
  });
}
