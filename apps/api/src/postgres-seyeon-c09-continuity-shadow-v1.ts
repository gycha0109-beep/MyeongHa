import { createHash } from 'node:crypto';
import type { SeyeonRuntimeContextV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import { selectSeyeonRuntimeRetrievedMemoriesV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import { createPostgresSeyeonProductionContextReadAuthorityPortV1 } from './postgres-seyeon-production-context-read-v1.js';
import { createPostgresSeyeonProductionRelationshipReadAuthorityPortV1 } from './postgres-seyeon-production-relationship-read-v1.js';
import {
  composeSeyeonProductionContextV1,
  type SeyeonProductionPersonalRecordProjectorV1,
} from './seyeon-production-context-v1.js';
import { readSeyeonProductionRelationshipTurnBindingV1 } from './seyeon-production-relationship-read-v1.js';
import { projectSeyeonProductionRelationshipBandsV1 } from './seyeon-production-relationship-band-v1.js';
import {
  createSeyeonC09ContinuityShadowV1,
  fingerprintSeyeonC09ContinuityContextV1,
  SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1,
  type SeyeonC09ContinuityAuthoritySnapshotPortV1,
} from './seyeon-c09-continuity-shadow-v1.js';
import type { SeyeonStructuredProviderPortV2 } from './seyeon-character-runtime-v2.js';

export const POSTGRES_SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1 =
  'postgres-seyeon-c09-continuity-shadow-v1' as const;

export class PostgresSeyeonC09ContinuityShadowHoldV1 extends Error {
  readonly code = 'C09_DB_AUTHORITY_UNVERIFIABLE' as const;
  constructor() {
    super('C09 independent PostgreSQL continuity authority is unavailable.');
    this.name = 'PostgresSeyeonC09ContinuityShadowHoldV1';
  }
}

/**
 * The authorised thread binding comes from the existing subject-scoped
 * function; even redacted and tombstoned messages count. No model text,
 * snapshots or user-supplied IDs can grant access.
 *
 * This read-only Shadow is NOT a transactional Reveal pin.
 */
export const POSTGRES_SEYEON_C09_CONTINUITY_CENSUS_SQL_V1 = [
  'with authorized_thread as materialized (',
  ' select thread_id, status, participant_character_ids',
  ' from public.qry_chat_thread_runtime_binding_v1($1::uuid,$2::uuid)',
  '), thread_messages as materialized (',
  ' select m.id::text as message_id, m.sequence_no, m.sender_type,',
  '        m.redacted_at, m.body_text',
  ' from public.conversation_messages m',
  ' join authorized_thread t on t.thread_id = m.thread_id',
  ' where m.subject_id = $1::uuid and m.thread_id = $2::uuid',
  ') select t.status as "threadStatus",',
  ' t.participant_character_ids as "participantCharacterIds",',
  ' (select count(*)::text from thread_messages) as "fullThreadMessageCount",',
  ' (select m.message_id from thread_messages m',
  '   order by m.sequence_no desc limit 1) as "latestMessageId",',
  ' (select m.sender_type from thread_messages m',
  '   order by m.sequence_no desc limit 1) as "latestSenderType",',
  ' (select m.redacted_at::text from thread_messages m',
  '   order by m.sequence_no desc limit 1) as "latestRedactedAt",',
  ' (select m.body_text from thread_messages m',
  '   order by m.sequence_no desc limit 1) as "latestMessageText"',
  ' from authorized_thread t',
].join('\n');

type CensusRow = Readonly<{
  threadStatus: unknown;
  participantCharacterIds: unknown;
  fullThreadMessageCount: unknown;
  latestMessageId: unknown;
  latestSenderType: unknown;
  latestRedactedAt: unknown;
  latestMessageText: unknown;
}>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function comparable(value: unknown): string {
  return JSON.stringify(value);
}

function fail(): never {
  throw new PostgresSeyeonC09ContinuityShadowHoldV1();
}

/**
 * An existing canonical-subject-scoped server DB transaction independently
 * recreates model-readable context from established Production source readers.
 *
 * Projectors must be from the server-approved registry; without a projector,
 * positive personal memory is intentionally not admitted.
 */
export function createPostgresSeyeonC09ContinuitySnapshotPortV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  threadId: string;
  context: SeyeonRuntimeContextV2;
  serverOwnedPersonalRecordProjectors?: readonly SeyeonProductionPersonalRecordProjectorV1[];
}>): SeyeonC09ContinuityAuthoritySnapshotPortV1 {
  const subjectId = input.scope?.resolvedSubject?.subjectId;
  const client = input.scope?.client;
  const context = input.context;
  if (!uuid(subjectId) || !uuid(input.threadId) || !client ||
      typeof client.query !== 'function' || !context ||
      (input.scope.resolvedSubject.subjectKind !== 'member' &&
       input.scope.resolvedSubject.subjectKind !== 'guest')) fail();

  const threadId = input.threadId;
  return Object.freeze({
    subjectId,
    threadId,
    async readAuthoritativeSnapshot(request: Readonly<{
      subjectId: string;
      threadId: string;
      currentUserMessageId: string;
    }>): Promise<unknown> {
      const latest = context.recentConversation.at(-1);
      if (!request || request.subjectId !== subjectId ||
          request.threadId !== threadId || !uuid(request.currentUserMessageId) ||
          request.currentUserMessageId !== latest?.messageId ||
          latest.role !== 'user' ||
          context.recentConversation.length < 2) fail();

      try {
        const censusResult = await client.query<CensusRow>(
          POSTGRES_SEYEON_C09_CONTINUITY_CENSUS_SQL_V1,
          [subjectId, threadId],
        );
        const row = censusResult.rows[0];
        if (censusResult.rows.length !== 1 || !row ||
            row.threadStatus !== 'active' ||
            !Array.isArray(row.participantCharacterIds) ||
            row.participantCharacterIds.length !== 1 ||
            row.participantCharacterIds[0] !== 'seyeon' ||
            row.latestMessageId !== request.currentUserMessageId ||
            row.latestSenderType !== 'user' ||
            row.latestRedactedAt !== null ||
            row.latestMessageText !== latest.text) fail();

        const count = typeof row.fullThreadMessageCount === 'string'
          ? Number(row.fullThreadMessageCount) : row.fullThreadMessageCount;
        if (typeof count !== 'number' ||
            !Number.isSafeInteger(count) ||
            count < context.recentConversation.length) fail();

        const relationshipAuthority = await readSeyeonProductionRelationshipTurnBindingV1({
          resolvedSubjectId: subjectId,
          authorityPort: createPostgresSeyeonProductionRelationshipReadAuthorityPortV1(client),
          bandProjector: { project: projectSeyeonProductionRelationshipBandsV1 },
        });
        if (comparable(relationshipAuthority.relationship) !== comparable(context.relationship) ||
            comparable(relationshipAuthority.relationshipSemantics) !== comparable(context.relationshipSemantics)) {
          fail();
        }

        const source = await composeSeyeonProductionContextV1({
          resolvedSubjectId: subjectId,
          threadId,
          currentUserMessageRef: request.currentUserMessageId,
          relationshipRevisionUsedForTurn: relationshipAuthority.relationshipRevisionUsedForTurn,
          authorityPort: createPostgresSeyeonProductionContextReadAuthorityPortV1(client),
          serverOwnedPersonalRecordProjectors: input.serverOwnedPersonalRecordProjectors ?? [],
          maxRecentMessages: context.recentConversation.length - 1,
          maxRelationshipEvents: 16,
          maxPersonalRecords: 16,
        });

        if (comparable(source.recentMessages) !==
            comparable(context.recentConversation.slice(0, -1))) fail();

        const selected = selectSeyeonRuntimeRetrievedMemoriesV2({
          retrievedMemories: source.retrievedMemories,
          maxRetrievedMemories: context.retrievedMemories.length || 8,
        });
        if (comparable(selected) !== comparable(context.retrievedMemories)) fail();

        const grantEvidence = source.personalRecordProjectionCandidates ?? [];
        const setMaterial = grantEvidence.map((item) => ({
          recordId: item.recordId,
          grantId: item.grantId,
          rawRecordPgDigest: item.rawRecordPgDigest ?? null,
          projectedMemoryDigest: item.projectedMemoryDigest,
          projectorVersion: item.projectorVersion ?? null,
        })).sort((a, b) => a.recordId.localeCompare(b.recordId) || a.grantId.localeCompare(b.grantId));
        const grantSetFingerprint =
          'sha256:' + createHash('sha256').update(JSON.stringify(setMaterial), 'utf8').digest('hex');

        return Object.freeze({
          schemaVersion: SEYEON_C09_CONTINUITY_SHADOW_VERSION_V1,
          subjectId,
          threadId,
          currentUserMessageId: request.currentUserMessageId,
          complete: true as const,
          latestSenderType: 'user' as const,
          fullThreadMessageCount: count,
          contextSha256: fingerprintSeyeonC09ContinuityContextV1(context),
          grantSetFingerprint,
          relationshipRevision: relationshipAuthority.relationshipRevisionUsedForTurn,
          authorizedMemoryIds: Object.freeze(context.retrievedMemories.map((m) => m.memoryId)),
        });
      } catch {
        return fail();
      }
    },
  });
}


/**
 * Opt-in offline Shadow composition. Caller must own an existing
 * verified-subject PostgreSQL transaction and governed assembled Context.
 * No production HTTP routing, DB writes or automatic provider selection.
 */
export function createPostgresSeyeonC09ContinuityShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  threadId: string;
  context: SeyeonRuntimeContextV2;
  candidateProvider: SeyeonStructuredProviderPortV2;
  reviewerProvider: SeyeonStructuredProviderPortV2;
  serverOwnedPersonalRecordProjectors?: readonly SeyeonProductionPersonalRecordProjectorV1[];
}>) {
  return createSeyeonC09ContinuityShadowV1({
    candidateProvider: input.candidateProvider,
    reviewerProvider: input.reviewerProvider,
    authoritySnapshotPort: createPostgresSeyeonC09ContinuitySnapshotPortV1({
      scope: input.scope,
      threadId: input.threadId,
      context: input.context,
      ...(input.serverOwnedPersonalRecordProjectors === undefined
        ? {}
        : { serverOwnedPersonalRecordProjectors: input.serverOwnedPersonalRecordProjectors }),
    }),
  });
}
