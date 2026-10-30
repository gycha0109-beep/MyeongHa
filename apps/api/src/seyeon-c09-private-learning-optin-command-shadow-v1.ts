import { randomUUID } from 'node:crypto';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  createPostgresSeyeonC09PrivateApprovedSourceShadowV1,
} from './postgres-seyeon-c09-private-approved-source-shadow-v1.js';
import {
  createSeyeonC09ReviewedOriginalTopicAuthorityShadowV1,
  type C09ReviewedOriginalSourceAuthorityShadowV1,
} from './seyeon-c09-reviewed-original-topic-authority-shadow-v1.js';
import { createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1 } from './postgres-seyeon-c09-published-topic-authority-shadow-v1.js';

export const SEYEON_C09_PRIVATE_OPTIN_COMMAND_SHADOW_VERSION_V1 =
  'seyeon-c09-private-optin-command-shadow-v1' as const;

export class SeyeonC09PrivateOptinCommandHoldV1 extends Error {
  readonly code = 'C09_PRIVATE_OPTIN_COMMAND_NOT_AUTHORIZED' as const;
  constructor() {
    super('The private learning opt-in must originate from a verified Member action and an approved original.');
    this.name = 'SeyeonC09PrivateOptinCommandHoldV1';
  }
}

const fail = (): never => { throw new SeyeonC09PrivateOptinCommandHoldV1(); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const AWARENESS = ['heard_of', 'basic', 'practiced', 'proficient'] as const;

export interface C09PrivateLearningUserActionShadowV1 {
  readonly action: 'approve_private_learning';
  readonly originalMessageId: string;
}

export interface C09PrivateLearningTopicDecisionShadowV1 {
  readonly serverApproved: true;
  readonly topicKey: string;
  readonly awareness: typeof AWARENESS[number];
  readonly learnedAt: string;
  readonly validAt: string;
}

/** Server-owned content/topic approval, never a client-supplied classification. */
export interface C09PrivateLearningTopicAuthorityShadowV1 {
  decide(input: Readonly<{
    subjectId: string;
    messageId: string;
    originalContentHash: string;
    originalBodyText: string;
    originalCreatedAt: string;
  }>): Promise<unknown>;
}

export const C09_PRIVATE_OPTIN_ORIGINAL_SQL_V1 = [
  'select content_hash as "contentHash", body_text as "bodyText",',
  ' created_at as "createdAt"',
  'from public.conversation_messages',
  'where id=$1::uuid and subject_id=$2::uuid',
  " and sender_type='user' and redacted_at is null",
  'for share',
].join('\n');

export const C09_PRIVATE_OPTIN_EXISTING_RECEIPT_SQL_V1 = [
  'select action_ref as "actionRef",subject_id::text as "subjectId",',
  ' original_message_id::text as "messageId",',
  ' original_content_hash as "contentHash",state,withdrawn_at as "withdrawnAt"',
  'from myeongha_internal.character_learning_private_optin_receipts_v1',
  'where subject_id=$1::uuid and original_message_id=$2::uuid',
  'for share',
].join('\n');

export const C09_PRIVATE_OPTIN_RECEIPT_SQL_V1 = [
  'insert into myeongha_internal.character_learning_private_optin_receipts_v1',
  ' (action_ref,subject_id,original_message_id,original_content_hash,state,verified_at)',
  'select $1::text,$2::uuid,m.id,m.content_hash,\'approved\',clock_timestamp()',
  'from public.conversation_messages m',
  "where m.id=$3::uuid and m.subject_id=$2::uuid and m.sender_type='user'",
  ' and m.redacted_at is null and m.content_hash=$4::text',
  'on conflict (subject_id,original_message_id) do nothing',
  'returning action_ref as "actionRef",subject_id::text as "subjectId",',
  ' original_message_id::text as "messageId"',
].join('\n');

export const C09_PRIVATE_OPTIN_CAPTURE_SQL_V1 = [
  'select myeongha_internal.c09_capture_private_approved_source_shadow_v1(',
  ' $1::text,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,',
  ' $7::timestamptz,$8::timestamptz',
  ') as "sourceRef"',
].join('\n');

function iso(value: unknown): string {
  if (value instanceof Date) value = value.toISOString();
  if (typeof value !== 'string') throw new SeyeonC09PrivateOptinCommandHoldV1();
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || d.toISOString() !== value) fail();
  return value;
}

function topicDecision(raw: unknown, originalCreatedAt: string): C09PrivateLearningTopicDecisionShadowV1 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).length !== 5 || r.serverApproved !== true ||
      typeof r.topicKey !== 'string' || !TOPIC.test(r.topicKey) ||
      !AWARENESS.includes(r.awareness as typeof AWARENESS[number])) fail();
  const learnedAt = iso(r.learnedAt);
  const validAt = iso(r.validAt);
  if (Date.parse(learnedAt) < Date.parse(originalCreatedAt) ||
      Date.parse(learnedAt) > Date.parse(validAt) ||
      Date.parse(validAt) > Date.now()) fail();
  return Object.freeze({
    serverApproved: true,
    topicKey: r.topicKey as string,
    awareness: r.awareness as typeof AWARENESS[number],
    learnedAt,
    validAt,
  });
}

/**
 * Auth-bound command boundary, NOT registered on a public HTTP route.
 *
 * verifiedEvidence must be supplied by the existing trusted auth verifier,
 * never parsed from JSON or a client-selected Subject ID. Receipt INSERT and
 * Source+Audit capture share one transaction and therefore roll back together.
 *
 * This uses the NOT APPLIED proposal: the production API role has no
 * INSERT/EXECUTE privileges. No learning evidence is published.
 */
export function createSeyeonC09PrivateLearningOptinCommandShadowV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  /** Legacy isolated-fixture/Shadow authority; not a production review source. */
  topicAuthority?: C09PrivateLearningTopicAuthorityShadowV1;
  /** Actual integration seam: independently approved original plus scoped DB Topic. */
  approvedOriginals?: C09ReviewedOriginalSourceAuthorityShadowV1;
}>) {
  if (!input?.pool || typeof input.pool.connect !== 'function' ||
      (typeof input.topicAuthority?.decide === 'function') ===
      (typeof input.approvedOriginals?.readIndependentlyApprovedOriginal === 'function')) fail();

  return Object.freeze({
    async submit(request: Readonly<{
      verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
      userAction: C09PrivateLearningUserActionShadowV1;
    }>): Promise<Readonly<{
      version: typeof SEYEON_C09_PRIVATE_OPTIN_COMMAND_SHADOW_VERSION_V1;
      sourceRef: string;
      actionRef: string;
      scope: 'user_private';
      evidencePublished: false;
      productionActivated: false;
    }>> {
      const action = request?.userAction;
      if (!request?.verifiedEvidence || request.verifiedEvidence.kind !== 'member' ||
          !UUID.test(request.verifiedEvidence.verifiedAuthUserId) ||
          !action || Object.keys(action).length !== 2 ||
          action.action !== 'approve_private_learning' ||
          !UUID.test(action.originalMessageId)) fail();

      return executePostgresSubjectTransactionV1({
        pool: input.pool,
        verifiedEvidence: request.verifiedEvidence,
        execute: async (scope) => {
          if (scope.resolvedSubject.subjectKind !== 'member' ||
              !UUID.test(scope.resolvedSubject.subjectId)) fail();
          const subjectId = scope.resolvedSubject.subjectId;
          const original = await scope.client.query<{
            contentHash: unknown;
            bodyText: unknown;
            createdAt: unknown;
          }>(C09_PRIVATE_OPTIN_ORIGINAL_SQL_V1, [action.originalMessageId, subjectId]);
          if (original.rows.length !== 1) fail();
          const row = original.rows[0]!;
          if (typeof row.contentHash !== 'string' || !row.contentHash.trim() ||
              row.contentHash.length > 512 ||
              typeof row.bodyText !== 'string' || !row.bodyText.trim()) {
            throw new SeyeonC09PrivateOptinCommandHoldV1();
          }
          const createdAt = iso(row.createdAt);
          const sourceRef = 'c09:conversation:' + action.originalMessageId;

          // The original message + canonical owner is the replay key.
          // Never generate a second receipt or Source+Audit for an approved
          // original, even after a successful COMMIT with a lost HTTP reply.
          const findExisting = async (): Promise<string | null> => {
            const existing = await scope.client.query<{
              actionRef: unknown; subjectId: unknown; messageId: unknown;
              contentHash: unknown; state: unknown; withdrawnAt: unknown;
            }>(C09_PRIVATE_OPTIN_EXISTING_RECEIPT_SQL_V1, [
              subjectId, action.originalMessageId,
            ]);
            if (existing.rows.length > 1) fail();
            const previous = existing.rows[0];
            if (previous === undefined) return null;
            if (typeof previous.actionRef !== 'string' ||
                !previous.actionRef.startsWith('c09:member-private-optin:') ||
                previous.subjectId !== subjectId ||
                previous.messageId !== action.originalMessageId ||
                previous.contentHash !== row.contentHash ||
                previous.state !== 'approved' ||
                previous.withdrawnAt !== null) fail();
            return previous.actionRef as string;
          };

          let actionRef = await findExisting();
          let decided: C09PrivateLearningTopicDecisionShadowV1 | null = null;
          if (actionRef === null) {
            const topicAuthority = input.approvedOriginals !== undefined
              ? createSeyeonC09ReviewedOriginalTopicAuthorityShadowV1({
                  approvedOriginals: input.approvedOriginals,
                  publishedTopics: createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1({ scope }),
                })
              : input.topicAuthority!;
            decided = topicDecision(await topicAuthority.decide({
              subjectId,
              messageId: action.originalMessageId,
              originalContentHash: row.contentHash,
              originalBodyText: row.bodyText,
              originalCreatedAt: createdAt,
            }), createdAt);

            const proposedRef = 'c09:member-private-optin:' + randomUUID();
            const receipt = await scope.client.query<{
              actionRef: unknown; subjectId: unknown; messageId: unknown;
            }>(C09_PRIVATE_OPTIN_RECEIPT_SQL_V1, [
              proposedRef, subjectId, action.originalMessageId, row.contentHash,
            ]);

            if (receipt.rows.length === 0) {
              // Unique-key conflict: another transaction has committed
              // the approval. Verify it rather than replaying the write.
              actionRef = await findExisting();
              if (actionRef === null) fail();
              decided = null;
            } else {
              if (receipt.rows.length !== 1 ||
                  receipt.rows[0]?.actionRef !== proposedRef ||
                  receipt.rows[0]?.subjectId !== subjectId ||
                  receipt.rows[0]?.messageId !== action.originalMessageId) fail();
              actionRef = proposedRef;
            }
          }

          if (decided !== null) {
            const captured = await scope.client.query<{ sourceRef: unknown }>(
              C09_PRIVATE_OPTIN_CAPTURE_SQL_V1,
              [sourceRef, subjectId, action.originalMessageId, actionRef,
                decided.topicKey, decided.awareness, decided.learnedAt, decided.validAt],
            );
            if (captured.rows.length !== 1 ||
                captured.rows[0]?.sourceRef !== sourceRef) fail();
          }

          const authority = createPostgresSeyeonC09PrivateApprovedSourceShadowV1({ scope });
          const rawProof = await authority.readApprovedPublication({ subjectId, sourceRef });
          if (!rawProof || typeof rawProof !== 'object' || Array.isArray(rawProof)) fail();
          const proof = rawProof as Record<string, unknown>;
          if (proof.sourceRef !== sourceRef || proof.approvalRef !== actionRef ||
              proof.visibility !== 'user_private' ||
              proof.sourceSubjectId !== subjectId ||
              (decided !== null &&
                (proof.topicKey !== decided.topicKey ||
                 proof.awareness !== decided.awareness))) fail();

          if (typeof actionRef !== 'string') {
            throw new SeyeonC09PrivateOptinCommandHoldV1();
          }
          return Object.freeze({
            version: SEYEON_C09_PRIVATE_OPTIN_COMMAND_SHADOW_VERSION_V1,
            sourceRef,
            actionRef,
            scope: 'user_private' as const,
            evidencePublished: false as const,
            productionActivated: false as const,
          });
        },
      });
    },
  });
}
