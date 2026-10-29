import { randomUUID } from 'node:crypto';
import type {
  SeyeonC09KnowledgeEvidenceShadowV1,
} from '../../../packages/domain/src/seyeon-c09-epistemic-resolver-shadow-v1.js';

export const SEYEON_C09_LEARNING_PUBLICATION_SHADOW_VERSION_V1 =
  'seyeon-c09-learning-publication-shadow-v1' as const;

export class SeyeonC09LearningPublicationHoldV1 extends Error {
  readonly code = 'C09_LEARNING_PUBLICATION_NOT_AUTHORIZED' as const;
  constructor() {
    super('Learning publication or revocation is not independently authorized.');
    this.name = 'SeyeonC09LearningPublicationHoldV1';
  }
}

const fail = (): never => { throw new SeyeonC09LearningPublicationHoldV1(); };
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_KINDS = ['canon', 'approved_character_fact', 'user_taught_verified', 'public_verified', 'experience'] as const;
const LEVELS = ['heard_of', 'basic', 'practiced', 'proficient'] as const;

function stringRef(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0 && x.length <= 512 && x === x.trim();
}
function time(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x)) return false;
  const millis = Date.parse(x);
  return Number.isFinite(millis) && new Date(millis).toISOString() === x;
}

/**
 * An independent, server-owned authority must verify real source integrity,
 * user opt-in for character sharing, anonymization/privacy, and owner approval.
 *
 * Caller cannot fabricate an approval by setting booleans in a request.
 */
export interface SeyeonC09LearningPublicationSourceAuthorityV1 {
  readApprovedPublication(input: Readonly<{
    subjectId: string;
    sourceRef: string;
  }>): Promise<unknown>;
  readApprovedRevocation(input: Readonly<{
    subjectId: string;
    evidenceId: string;
  }>): Promise<unknown>;
}

export interface SeyeonC09ApprovedLearningPublicationReceiptV1 {
  readonly subjectId: string;
  readonly sourceRef: string;
  readonly characterId: 'seyeon';
  readonly topicKey: string;
  readonly sourceKind: SeyeonC09KnowledgeEvidenceShadowV1['sourceKind'];
  readonly awareness: SeyeonC09KnowledgeEvidenceShadowV1['awareness'];
  readonly visibility: 'user_private' | 'character_shared';
  readonly sourceSubjectId: string | null;
  readonly approvalRef: string;
  readonly verifiedAt: string;
  readonly learnedAt: string;
  readonly validAt: string;
  readonly sharingConsentRef: string | null;
  readonly privacyReviewRef: string | null;
  readonly privacyReviewedAt: string | null;
  readonly verifiedOriginalSource: true;
  readonly approvedForKnowledgePublication: true;
  readonly deidentifiedForSharing: boolean;
}

export type SeyeonC09LearningSqlCommandShadowV1 = Readonly<{
  readonly version: typeof SEYEON_C09_LEARNING_PUBLICATION_SHADOW_VERSION_V1;
  readonly scope: 'PROPOSAL_SQL_ONLY_NO_EXECUTION';
  readonly operation: 'ISSUE' | 'REVOKE';
  readonly sql: string;
  readonly parameters: readonly (string | null)[];
  readonly mayExecuteInProduction: false;
}>;

export const SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1 = [
  'insert into myeongha_internal.character_learning_evidence_v1 (',
  ' id, character_id, topic_key, source_kind, authority_ref, awareness,',
  ' visibility, subject_id, approved_for_character_sharing, privacy_reviewed_at,',
  ' privacy_review_ref, sharing_consent_ref, approval_ref, verified_at, learned_at, valid_at',
  ') values (',
  ' $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text,',
  ' $7::text, $8::uuid, $9::boolean, $10::timestamptz,',
  ' $11::text, $12::text, $13::text, $14::timestamptz, $15::timestamptz, $16::timestamptz',
  ') returning id::text as "evidenceId"',
].join('\n');

export const SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1 = [
  'update myeongha_internal.character_learning_evidence_v1',
  'set revoked_at = $3::timestamptz',
  'where id = $1::uuid and character_id = \'seyeon\'',
  ' and authority_ref = $2::text and revoked_at is null',
  ' and verified_at <= $3::timestamptz',
  'returning id::text as "evidenceId"',
].join('\n');

function requireReceipt(value: unknown, subjectId: string, sourceRef: string):
  SeyeonC09ApprovedLearningPublicationReceiptV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const r = value as Partial<SeyeonC09ApprovedLearningPublicationReceiptV1>;
  if (Object.keys(r).length !== 18 ||
      r.subjectId !== subjectId || r.sourceRef !== sourceRef ||
      r.characterId !== 'seyeon' || !TOPIC.test(r.topicKey ?? '') ||
      !SOURCE_KINDS.includes(r.sourceKind!) ||
      !LEVELS.includes(r.awareness! as typeof LEVELS[number]) ||
      !['user_private', 'character_shared'].includes(r.visibility ?? '') ||
      !stringRef(r.approvalRef) || !time(r.verifiedAt) ||
      !time(r.learnedAt) || !time(r.validAt) ||
      Date.parse(r.learnedAt!) > Date.parse(r.verifiedAt!) ||
      Date.parse(r.learnedAt!) > Date.parse(r.validAt!) ||
      r.verifiedOriginalSource !== true ||
      r.approvedForKnowledgePublication !== true ||
      typeof r.deidentifiedForSharing !== 'boolean') fail();

  if (r.visibility === 'user_private') {
    if (r.sourceSubjectId !== subjectId ||
        r.sharingConsentRef !== null || r.privacyReviewRef !== null ||
        r.privacyReviewedAt !== null) fail();
  } else {
    // Approval to share is different from remembering the user's claim.
    if (r.sourceSubjectId !== null || !stringRef(r.sharingConsentRef) ||
        !stringRef(r.privacyReviewRef) || !time(r.privacyReviewedAt) || !r.deidentifiedForSharing) fail();
  }
  return r as SeyeonC09ApprovedLearningPublicationReceiptV1;
}

/**
 * This returns *parameterized* SQL for a separately governed migration.
 * It does NOT run a query, grant privileges, or write to Supabase.
 */
export function createSeyeonC09LearningPublicationPlannerShadowV1(input: Readonly<{
  subjectId: string;
  sourceAuthority: SeyeonC09LearningPublicationSourceAuthorityV1;
}>) {
  if (!UUID.test(input?.subjectId ?? '') ||
      typeof input.sourceAuthority?.readApprovedPublication !== 'function' ||
      typeof input.sourceAuthority?.readApprovedRevocation !== 'function') fail();

  const subjectId = input.subjectId;
  return Object.freeze({
    async prepareIssue(request: Readonly<{ subjectId: string; sourceRef: string }>): Promise<SeyeonC09LearningSqlCommandShadowV1> {
      if (request.subjectId !== subjectId || !stringRef(request.sourceRef)) fail();
      let received: unknown;
      try {
        received = await input.sourceAuthority.readApprovedPublication({ subjectId, sourceRef: request.sourceRef });
      } catch { return fail(); }
      const r = requireReceipt(received, subjectId, request.sourceRef);
      const issueId = randomUUID();
      return Object.freeze({
        version: SEYEON_C09_LEARNING_PUBLICATION_SHADOW_VERSION_V1,
        scope: 'PROPOSAL_SQL_ONLY_NO_EXECUTION' as const,
        operation: 'ISSUE' as const,
        sql: SEYEON_C09_LEARNING_ISSUE_SQL_SHADOW_V1,
        parameters: Object.freeze([
          issueId, 'seyeon', r.topicKey, r.sourceKind, r.sourceRef,
          r.awareness, r.visibility, r.visibility === 'user_private' ? subjectId : null,
          r.visibility === 'character_shared' ? 'true' : 'false',
          r.privacyReviewedAt,
          r.privacyReviewRef, r.sharingConsentRef, r.approvalRef, r.verifiedAt, r.learnedAt, r.validAt,
        ]),
        mayExecuteInProduction: false as const,
      });
    },
    async prepareRevoke(request: Readonly<{
      subjectId: string;
      evidenceId: string;
    }>): Promise<SeyeonC09LearningSqlCommandShadowV1> {
      if (request.subjectId !== subjectId || !UUID.test(request.evidenceId)) fail();
      let raw: unknown;
      try {
        raw = await input.sourceAuthority.readApprovedRevocation({
          subjectId,
          evidenceId: request.evidenceId,
        });
      } catch { return fail(); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
      const proof = raw as Record<string, unknown>;
      if (Object.keys(proof).length !== 6 ||
          proof.subjectId !== subjectId || proof.evidenceId !== request.evidenceId ||
          proof.characterId !== 'seyeon' || proof.revocationApproved !== true ||
          !stringRef(proof.authorityRef) || !time(proof.revokedAt)) fail();
      return Object.freeze({
        version: SEYEON_C09_LEARNING_PUBLICATION_SHADOW_VERSION_V1,
        scope: 'PROPOSAL_SQL_ONLY_NO_EXECUTION' as const,
        operation: 'REVOKE' as const,
        sql: SEYEON_C09_LEARNING_REVOKE_SQL_SHADOW_V1,
        parameters: Object.freeze([request.evidenceId, proof.authorityRef as string, proof.revokedAt as string]),
        mayExecuteInProduction: false as const,
      });
    },
  });
}
