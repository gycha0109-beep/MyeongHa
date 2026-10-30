import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';

export const SEYEON_C09_REVIEW_ISSUANCE_SHADOW_VERSION_V1 =
  'seyeon-c09-original-review-issuance-shadow-v1' as const;

/**
 * A caller must verify reviewer identity, approval provenance and policy
 * independently. This port MUST NOT simply echo HTTP JSON or a model output.
 * A separate trusted reviewer service/credential is not provisioned here.
 */
export interface C09IndependentReviewVerificationPortV1 {
  verifyOriginalReview(input: Readonly<{
    canonicalSubjectId: string;
    originalMessageId: string;
  }>): Promise<unknown>;
}

export interface C09OriginalReviewIssuanceScopeV1 {
  readonly scope: PostgresSubjectExecutionScopeV1;
  readonly reviewVerification: C09IndependentReviewVerificationPortV1;
}

export const C09_ISSUE_ORIGINAL_REVIEW_SQL_V1 = [
  'select myeongha_internal.c09_issue_original_review_shadow_v1(',
  ' $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,',
  ' $7::text,$8::text,$9::timestamptz,$10::timestamptz',
  ') as "reviewRef"',
].join('\n');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const AWARENESS = ['heard_of', 'basic', 'practiced', 'proficient'] as const;
const KEY = [
  'awareness', 'learnedAt', 'originalContentHash', 'originalMessageId',
  'reviewPolicyRef', 'reviewRef', 'reviewerRef', 'status', 'subjectId',
  'topicKey', 'validAt', 'verification',
] as const;

export class SeyeonC09OriginalReviewIssuanceHoldV1 extends Error {
  readonly code = 'C09_INDEPENDENT_REVIEW_ISSUANCE_UNAVAILABLE' as const;
  constructor() {
    super('Trusted independent reviewer approval and a dedicated writer scope are required.');
    this.name = 'SeyeonC09OriginalReviewIssuanceHoldV1';
  }
}

const fail = (): never => { throw new SeyeonC09OriginalReviewIssuanceHoldV1(); };
function ref(x: unknown): x is string {
  return typeof x === 'string' && x.length>0 &&
    x.length<=512 && x.trim()===x;
}
function iso(x: unknown): x is string {
  if (typeof x !== 'string' || !Number.isFinite(Date.parse(x))) return false;
  return new Date(x).toISOString() === x;
}

/**
 * This is a PRIVATE, unmounted transaction-scope step. It does not create a
 * canonical Subject or assume a privileged role. The caller MUST have already
 * bound verified Member identity to the dedicated reviewer writer transaction.
 *
 * The SQL function independently rejects any caller other than the separate
 * NOLOGIN review writer, and locks both original message and published Topic
 * before the insert. No opt-in receipt, learning evidence or persona change.
 */
export function createSeyeonC09OriginalReviewIssuanceShadowV1(
  input: Readonly<C09OriginalReviewIssuanceScopeV1>,
) {
  const subject = input?.scope?.resolvedSubject;
  const query = input?.scope?.client?.query?.bind(input.scope.client);
  if (!subject || subject.subjectKind !== 'member' ||
      !UUID.test(subject.subjectId) || !query ||
      typeof input.reviewVerification?.verifyOriginalReview !== 'function') fail();

  const canonicalSubjectId = subject.subjectId;
  return Object.freeze({
    async issue(originalMessageId: string) {
      if (typeof originalMessageId !== 'string' || !UUID.test(originalMessageId)) fail();
      try {
        const verified = await input.reviewVerification.verifyOriginalReview({
          canonicalSubjectId, originalMessageId,
        });
        if (!verified || typeof verified !== 'object' || Array.isArray(verified)) fail();
        const r = verified as Record<string, unknown>;
        if (JSON.stringify(Object.keys(r).sort()) !== JSON.stringify([...KEY].sort()) ||
            r.verification !== 'independently_verified_by_server' ||
            r.status !== 'approved' ||
            r.subjectId !== canonicalSubjectId ||
            r.originalMessageId !== originalMessageId ||
            !ref(r.originalContentHash) || !ref(r.reviewRef) ||
            !ref(r.reviewerRef) || !ref(r.reviewPolicyRef) ||
            typeof r.topicKey !== 'string' || !TOPIC.test(r.topicKey) ||
            !AWARENESS.includes(r.awareness as typeof AWARENESS[number]) ||
            !iso(r.learnedAt) || !iso(r.validAt) ||
            Date.parse(r.learnedAt as string) > Date.parse(r.validAt as string) ||
            Date.parse(r.validAt as string) > Date.now()) fail();

        const result = await query<{ reviewRef: unknown }>(
          C09_ISSUE_ORIGINAL_REVIEW_SQL_V1,
          [canonicalSubjectId, originalMessageId, r.originalContentHash,
            r.reviewRef, r.topicKey, r.awareness, r.reviewerRef,
            r.reviewPolicyRef, r.learnedAt, r.validAt],
        );
        if (result.rows.length!==1 || result.rows[0]?.reviewRef !== r.reviewRef) fail();
        return Object.freeze({
          version: SEYEON_C09_REVIEW_ISSUANCE_SHADOW_VERSION_V1,
          reviewRef: r.reviewRef,
          scope: 'user_private' as const,
          optInIssued: false as const,
          learningPublished: false as const,
          productionActivated: false as const,
        });
      } catch {
        return fail();
      }
    },
  });
}
