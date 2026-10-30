import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import type {
  SeyeonC09LearningPublicationSourceAuthorityV1,
  SeyeonC09ApprovedLearningPublicationReceiptV1,
} from './seyeon-c09-learning-evidence-publication-shadow-v1.js';

export const POSTGRES_SEYEON_C09_PUBLICATION_SOURCE_SHADOW_VERSION_V1 =
  'postgres-seyeon-c09-publication-source-shadow-v1' as const;

export class SeyeonC09PublicationSourceUnavailableV1 extends Error {
  readonly code = 'C09_PUBLICATION_SOURCE_NOT_DEPLOYED' as const;
  constructor() {
    super('Governed learning publication source ledger is not available.');
    this.name = 'SeyeonC09PublicationSourceUnavailableV1';
  }
}
const hold = (): never => { throw new SeyeonC09PublicationSourceUnavailableV1(); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;

export const POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1 = [
  'select a.owner_subject_id::text as "subjectId",',
  ' a.source_ref as "sourceRef",a.character_id as "characterId",',
  ' a.topic_key as "topicKey",a.source_kind as "sourceKind",',
  ' a.awareness as "awareness",a.visibility as "visibility",',
  ' case when a.visibility = \'user_private\' then a.owner_subject_id::text',
  ' else null end as "sourceSubjectId",',
  ' a.approval_ref as "approvalRef",',
  ' a.verified_at as "verifiedAt",a.learned_at as "learnedAt",',
  ' a.valid_at as "validAt",a.sharing_consent_ref as "sharingConsentRef",',
  ' a.privacy_review_ref as "privacyReviewRef",',
  ' a.privacy_reviewed_at as "privacyReviewedAt",',
  ' a.deidentified_for_sharing as "deidentifiedForSharing",',
  ' a.source_verification_ref as "sourceVerificationRef"',
  'from myeongha_internal.character_learning_source_approvals_v1 a',
  'join myeongha_internal.character_knowledge_topics_v1 t',
  ' on t.character_id=a.character_id and t.topic_key=a.topic_key',
  'where a.owner_subject_id=$1::uuid and a.source_ref=$2::text',
  ' and a.character_id=\'seyeon\'',
  ' and a.approved_at<=clock_timestamp() and a.verified_at<=clock_timestamp()',
  ' and a.valid_at<=clock_timestamp() and a.revoked_at is null',
  ' and t.published_at is not null and t.published_at<=clock_timestamp()',
  ' and t.revoked_at is null',
].join('\n');

export const POSTGRES_SEYEON_C09_SOURCE_CONSENT_SQL_V1 = [
  'select c.owner_subject_id::text as "subjectId",',
  ' c.source_ref as "sourceRef",c.consent_ref as "sharingConsentRef",',
  ' c.topic_key as "topicKey",c.state as "status",',
  ' c.revision::text as "revision",c.verified_at as "verifiedAt"',
  'from myeongha_internal.character_learning_sharing_consents_v1 c',
  'where c.owner_subject_id=$1::uuid and c.source_ref=$2::text',
  ' and c.consent_ref=$3::text and c.topic_key=$4::text',
  ' and c.verified_at <= clock_timestamp()',
].join('\n');

export const POSTGRES_SEYEON_C09_SOURCE_REVOKE_SQL_V1 = [
  'select a.owner_subject_id::text as "subjectId",',
  ' a.evidence_id::text as "evidenceId",s.character_id as "characterId",',
  ' a.source_ref as "authorityRef",',
  ' (a.state=\'approved\' and a.withdrawn_at is null) as "revocationApproved",',
  ' a.approved_at as "revokedAt",a.revision::text as "revision",',
  ' a.revocation_ref as "revocationRef"',
  'from myeongha_internal.character_learning_revocation_approvals_v1 a',
  'join myeongha_internal.character_learning_source_approvals_v1 s',
  ' on s.source_ref=a.source_ref and s.owner_subject_id=a.owner_subject_id',
  'join myeongha_internal.character_learning_evidence_v1 e',
  ' on e.id=a.evidence_id and e.authority_ref=a.source_ref',
  'where a.owner_subject_id=$1::uuid and a.evidence_id=$2::uuid',
  ' and a.state=\'approved\' and a.approved_at<=clock_timestamp()',
  ' and e.revoked_at is null',
].join('\n');

type DbRow = Record<string, unknown>;
function bounded(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 &&
    x.length <= 512 && x === x.trim();
}
function time(x: unknown): string {
  const v = x instanceof Date ? x.toISOString() : x;
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) hold();
  return new Date(v as string).toISOString();
}
function nullableTime(x: unknown): string | null {
  return x === null ? null : time(x);
}
function one(rows: readonly DbRow[]): DbRow {
  if (rows.length !== 1 || !rows[0]) hold();
  return rows[0]!;
}
function subjectMatches(row: DbRow, subjectId: string): void {
  if (row.subjectId !== subjectId) hold();
}

/**
 * This implements READS against the NOT DEPLOYED source-ledger proposal.
 * It is not an authorizer for mutations or a production authenticated caller.
 *
 * The canonical subject comes only from PostgresSubjectExecutionScopeV1.
 * A missing table, ACL or RLS denial fails closed.
 */
export function createPostgresSeyeonC09PublicationSourceShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>): SeyeonC09LearningPublicationSourceAuthorityV1 {
  const subjectId = input?.scope?.resolvedSubject?.subjectId;
  const query = input?.scope?.client?.query?.bind(input.scope.client);
  if (!subjectId || !UUID.test(subjectId) || !query) hold();

  return Object.freeze({
    async readApprovedPublication(request: Readonly<{subjectId: string; sourceRef: string}>) {
      if (request.subjectId !== subjectId || !bounded(request.sourceRef)) hold();
      try {
        const row = one((await query<DbRow>(
          POSTGRES_SEYEON_C09_SOURCE_APPROVAL_SQL_V1,
          [subjectId, request.sourceRef],
        )).rows);
        subjectMatches(row, subjectId);
        if (row.sourceRef !== request.sourceRef || row.characterId !== 'seyeon' ||
            typeof row.topicKey !== 'string' || !TOPIC.test(row.topicKey) ||
            !bounded(row.sourceVerificationRef) ||
            !bounded(row.approvalRef) ||
            typeof row.deidentifiedForSharing !== 'boolean' ||
            !['character_shared', 'user_private'].includes(row.visibility as string)) hold();
        const receipt: SeyeonC09ApprovedLearningPublicationReceiptV1 = Object.freeze({
          subjectId,
          sourceRef: request.sourceRef,
          characterId: 'seyeon',
          topicKey: row.topicKey as string,
          sourceKind: row.sourceKind as SeyeonC09ApprovedLearningPublicationReceiptV1['sourceKind'],
          awareness: row.awareness as SeyeonC09ApprovedLearningPublicationReceiptV1['awareness'],
          visibility: row.visibility as SeyeonC09ApprovedLearningPublicationReceiptV1['visibility'],
          sourceSubjectId: row.sourceSubjectId as string | null,
          approvalRef: row.approvalRef as string,
          verifiedAt: time(row.verifiedAt),
          learnedAt: time(row.learnedAt),
          validAt: time(row.validAt),
          sharingConsentRef: row.sharingConsentRef as string | null,
          privacyReviewRef: row.privacyReviewRef as string | null,
          privacyReviewedAt: nullableTime(row.privacyReviewedAt),
          verifiedOriginalSource: true,
          approvedForKnowledgePublication: true,
          deidentifiedForSharing: row.deidentifiedForSharing as boolean,
        });
        return receipt;
      } catch { return hold(); }
    },
    async readCurrentSharingConsent(request: Readonly<{subjectId: string; sourceRef: string; sharingConsentRef: string; topicKey: string}>) {
      if (request.subjectId !== subjectId || !bounded(request.sourceRef) ||
          !bounded(request.sharingConsentRef) || !TOPIC.test(request.topicKey)) hold();
      try {
        const row = one((await query<DbRow>(
          POSTGRES_SEYEON_C09_SOURCE_CONSENT_SQL_V1,
          [subjectId, request.sourceRef, request.sharingConsentRef, request.topicKey],
        )).rows);
        subjectMatches(row, subjectId);
        if (row.sourceRef !== request.sourceRef ||
            row.sharingConsentRef !== request.sharingConsentRef ||
            row.topicKey !== request.topicKey ||
            !['active', 'revoked'].includes(row.status as string)) hold();
        const revision = Number(row.revision);
        if (!Number.isSafeInteger(revision) || revision < 1) hold();
        return Object.freeze({
          subjectId,
          sourceRef: request.sourceRef,
          sharingConsentRef: request.sharingConsentRef,
          topicKey: request.topicKey,
          status: row.status,
          revision,
          verifiedAt: time(row.verifiedAt),
        });
      } catch { return hold(); }
    },
    async readApprovedRevocation(request: Readonly<{subjectId: string; evidenceId: string}>) {
      if (request.subjectId !== subjectId ||
          !UUID.test(request.evidenceId)) hold();
      try {
        const row = one((await query<DbRow>(
          POSTGRES_SEYEON_C09_SOURCE_REVOKE_SQL_V1,
          [subjectId, request.evidenceId],
        )).rows);
        subjectMatches(row, subjectId);
        const revision = Number(row.revision);
        if (row.evidenceId !== request.evidenceId ||
            row.characterId !== 'seyeon' || !bounded(row.authorityRef) ||
            row.revocationApproved !== true ||
            !Number.isSafeInteger(revision) || revision < 1) hold();
        return Object.freeze({
          subjectId,
          evidenceId: request.evidenceId,
          characterId: 'seyeon' as const,
          authorityRef: row.authorityRef,
          revocationApproved: true as const,
          revokedAt: time(row.revokedAt),
          revocationRef: row.revocationRef,
          revision,
        });
      } catch { return hold(); }
    },
  });
}
