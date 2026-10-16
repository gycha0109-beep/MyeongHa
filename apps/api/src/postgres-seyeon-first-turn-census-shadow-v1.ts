import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
  type SeyeonFullThreadCensusShadowPortV1,
} from './seyeon-fast-dialogue-shadow-v1.js';

/**
 * Read-only, uninstalled Shadow candidate. The query is designed for an
 * existing subject-scoped PostgreSQL executor transaction; it does not mint
 * subject identity or permission to reveal, commit, or call providers.
 */
export const POSTGRES_SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1 =
  'postgres-seyeon-first-turn-census-shadow-v1' as const;

export class PostgresSeyeonFirstTurnCensusShadowHoldV1 extends Error {
  readonly code = 'FIRST_TURN_CENSUS_UNVERIFIABLE' as const;
  constructor() {
    super('Authoritative first-turn census is unavailable.');
    this.name = 'PostgresSeyeonFirstTurnCensusShadowHoldV1';
  }
}

/**
 * Scan at most the first TWO message identities: exactly one establishes a
 * first-message candidate; any second row disproves first contact, including
 * redacted/tombstoned history. No message text or payload is selected.
 *
 * Requires existing 0950 subject-local RLS/SELECT and the 0770/1303
 * qry_chat_thread_runtime_binding_v1 read authority, all in the existing
 * verified canonical-subject PostgreSQL transaction.
 *
 * Even a valid result is only a READ COMMITTED snapshot, NOT a durable
 * transactional barrier against another user message or Grant revoke.
 */
export const POSTGRES_SEYEON_FIRST_TURN_CENSUS_SHADOW_SQL_V1 = `
with authorized_thread as materialized (
  select thread_id, status, participant_character_ids
  from public.qry_chat_thread_runtime_binding_v1($1::uuid, $2::uuid)
),
first_two_messages as materialized (
  select m.id, m.sequence_no, m.sender_type, m.redacted_at
  from public.conversation_messages m
  join authorized_thread t on t.thread_id = m.thread_id
  where m.subject_id = $1::uuid
    and m.thread_id = $2::uuid
  order by m.sequence_no asc
  limit 2
)
select
  t.status as "threadStatus",
  t.participant_character_ids as "participantCharacterIds",
  (select count(*)::text from first_two_messages) as "boundedMessageCount",
  coalesce((
    select (m.id = $3::uuid and m.sender_type = 'user' and m.redacted_at is null)
    from first_two_messages m
    order by m.sequence_no desc
    limit 1
  ), false) as "currentMessageIsLatestUser"
from authorized_thread t
`.trim();

type CensusRow = Readonly<{
  threadStatus: unknown;
  participantCharacterIds: unknown;
  boundedMessageCount: unknown;
  currentMessageIsLatestUser: unknown;
}>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;

function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new PostgresSeyeonFirstTurnCensusShadowHoldV1();
  }
}

export function createPostgresSeyeonFirstTurnCensusShadowV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  subjectId: string;
  threadId: string;
}>): SeyeonFullThreadCensusShadowPortV1 {
  assertUuid(input.subjectId);
  assertUuid(input.threadId);
  if (!input.client || typeof input.client.query !== 'function') {
    throw new PostgresSeyeonFirstTurnCensusShadowHoldV1();
  }
  const client = input.client;
  const subjectId = input.subjectId;
  const threadId = input.threadId;
  return Object.freeze({
    subjectId,
    threadId,
    async readFullThreadCensus(request: Readonly<{
      subjectId: string;
      threadId: string;
      currentUserMessageId: string;
    }>): Promise<unknown> {
      if (!request || request.subjectId !== subjectId ||
          request.threadId !== threadId) {
        throw new PostgresSeyeonFirstTurnCensusShadowHoldV1();
      }
      assertUuid(request.currentUserMessageId);
      let rows: readonly CensusRow[];
      try {
        const result = await client.query<CensusRow>(
          POSTGRES_SEYEON_FIRST_TURN_CENSUS_SHADOW_SQL_V1,
          [subjectId, threadId, request.currentUserMessageId],
        );
        rows = result.rows;
      } catch {
        throw new PostgresSeyeonFirstTurnCensusShadowHoldV1();
      }
      if (rows.length !== 1 || !rows[0]) {
        throw new PostgresSeyeonFirstTurnCensusShadowHoldV1();
      }
      const row = rows[0];
      if (row.threadStatus !== 'active' ||
          !Array.isArray(row.participantCharacterIds) ||
          row.participantCharacterIds.length !== 1 ||
          row.participantCharacterIds[0] !== 'seyeon' ||
          row.boundedMessageCount !== '1' ||
          row.currentMessageIsLatestUser !== true) {
        throw new PostgresSeyeonFirstTurnCensusShadowHoldV1();
      }
      return Object.freeze({
        schemaVersion: SEYEON_FIRST_TURN_CENSUS_SHADOW_VERSION_V1,
        subjectId,
        threadId,
        currentUserMessageId: request.currentUserMessageId,
        messageCount: 1 as const,
        latestSenderType: 'user' as const,
        complete: true as const,
      });
    },
  });
}
