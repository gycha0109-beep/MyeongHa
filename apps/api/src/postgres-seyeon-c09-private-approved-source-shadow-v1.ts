import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import type {
  SeyeonC09LearningPublicationSourceAuthorityV1,
  SeyeonC09ApprovedLearningPublicationReceiptV1,
} from './seyeon-c09-learning-evidence-publication-shadow-v1.js';
import {
  createPostgresSeyeonC09PublicationSourceShadowV1,
} from './postgres-seyeon-c09-publication-source-shadow-v1.js';

export const POSTGRES_SEYEON_C09_PRIVATE_APPROVED_SOURCE_SHADOW_VERSION_V1 =
  'postgres-seyeon-c09-private-approved-source-shadow-v1' as const;

export class PostgresSeyeonC09PrivateSourceProofHoldV1 extends Error {
  readonly code = 'C09_PRIVATE_ORIGINAL_PROOF_UNAVAILABLE' as const;
  constructor() {
    super('C09 approved private source has no current independently verified original and opt-in receipt.');
    this.name = 'PostgresSeyeonC09PrivateSourceProofHoldV1';
  }
}

export const POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1 = [
  'select (myeongha_internal.c09_verify_private_source_current_shadow_v1(',
  ' $1::uuid,$2::text)',
  ' and exists (',
  '  select 1',
  '  from myeongha_internal.character_learning_source_approvals_v1 source',
  '  join myeongha_internal.character_learning_private_optin_receipts_v1 action',
  '    on action.action_ref=source.approval_ref',
  '   and action.subject_id=source.owner_subject_id',
  '  join myeongha_internal.character_learning_original_reviews_v1 review',
  '    on review.owner_subject_id=source.owner_subject_id',
  '   and review.original_message_id=action.original_message_id',
  '   and review.original_content_hash=action.original_content_hash',
  '   and review.character_id=source.character_id',
  '   and review.topic_key=source.topic_key',
  '   and review.awareness=source.awareness',
  '  where source.owner_subject_id=$1::uuid and source.source_ref=$2::text',
  "   and source.visibility='user_private'",
  "   and source.source_kind='user_taught_verified'",
  "   and review.state='approved'",
  '   and review.revoked_at is null',
  '   and review.reviewed_at<=clock_timestamp()',
  '   and review.valid_at<=clock_timestamp()',
  ' )',
  ') as "currentlyVerified"',
].join('\n');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const fail = (): never => { throw new PostgresSeyeonC09PrivateSourceProofHoldV1(); };

function validRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 512 && value.trim() === value;
}

/**
 * Strict private-only Source Authority for the NOT APPLIED C09 source-capture
 * proposal. All user-taught knowledge requires BOTH original message integrity
 * and independently collected user opt-in, currently valid at the DB.
 *
 * No API route or production EXECUTE privilege uses this adapter. The
 * publication planner remains SQL ONLY; this does not make Issue executable.
 */
export function createPostgresSeyeonC09PrivateApprovedSourceShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>): SeyeonC09LearningPublicationSourceAuthorityV1 {
  const scope = input?.scope;
  const subjectId = scope?.resolvedSubject?.subjectId;
  const client = scope?.client;
  if (!subjectId || !UUID.test(subjectId) ||
      !client || typeof client.query !== 'function') fail();

  const underlying = createPostgresSeyeonC09PublicationSourceShadowV1({ scope });
  const verify = async (sourceRef: string): Promise<void> => {
    let rows: readonly { currentlyVerified?: unknown }[];
    try {
      rows = (await client.query<{ currentlyVerified?: unknown }>(
        POSTGRES_SEYEON_C09_PRIVATE_SOURCE_CURRENT_PROOF_SQL_V1,
        [subjectId, sourceRef],
      )).rows;
    } catch { return fail(); }
    if (rows.length !== 1 || rows[0]?.currentlyVerified !== true) fail();
  };

  return Object.freeze({
    async readApprovedPublication(request: Readonly<{ subjectId: string; sourceRef: string }>):
      Promise<SeyeonC09ApprovedLearningPublicationReceiptV1> {
      if (request.subjectId !== subjectId || !validRef(request.sourceRef)) fail();
      await verify(request.sourceRef);
      let receipt: unknown;
      try {
        receipt = await underlying.readApprovedPublication(request);
      } catch { return fail(); }
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) fail();
      const r = receipt as SeyeonC09ApprovedLearningPublicationReceiptV1;
      if (r.subjectId !== subjectId || r.sourceRef !== request.sourceRef ||
          r.characterId !== 'seyeon' ||
          r.visibility !== 'user_private' ||
          r.sourceKind !== 'user_taught_verified' ||
          r.sourceSubjectId !== subjectId ||
          r.sharingConsentRef !== null) fail();
      await verify(request.sourceRef);
      return Object.freeze(r);
    },
    readApprovedRevocation: (request: Readonly<{ subjectId: string; evidenceId: string }>) =>
      underlying.readApprovedRevocation(request),
    async readCurrentSharingConsent(): Promise<never> {
      // Shared knowledge requires a separate explicit sharing proof pathway.
      return fail();
    },
  });
}
