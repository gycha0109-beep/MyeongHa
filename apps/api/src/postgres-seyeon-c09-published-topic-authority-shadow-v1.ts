import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import type {
  C09PublishedKnowledgeTopicAuthorityShadowV1,
} from './seyeon-c09-reviewed-original-topic-authority-shadow-v1.js';

export const POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1 = [
  'select character_id as "characterId", topic_key as "topicKey",',
  ' policy_version as "policyVersion", authority_source_ref as "authoritySourceRef",',
  ' published_at as "publishedAt", revoked_at as "revokedAt"',
  'from myeongha_internal.character_knowledge_topics_v1',
  "where character_id='seyeon' and topic_key=$1::text",
  ' and published_at is not null and published_at<=clock_timestamp()',
  ' and revoked_at is null',
].join('\n');

export class PostgresC09PublishedTopicHoldV1 extends Error {
  readonly code = 'C09_PUBLISHED_TOPIC_UNAVAILABLE' as const;
  constructor() {
    super('Governed published topic is unavailable under the current Subject scope.');
    this.name = 'PostgresC09PublishedTopicHoldV1';
  }
}

const fail = (): never => { throw new PostgresC09PublishedTopicHoldV1(); };
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 512 && value.trim() === value;
}

function time(value: unknown): string {
  if (value instanceof Date) value = value.toISOString();
  if (typeof value !== 'string') fail();
  const date = new Date(value as string);
  if (!Number.isFinite(date.getTime())) fail();
  return date.toISOString();
}

/**
 * Reads the already deployed, RLS-gated Topic registry from the existing
 * canonical Subject transaction. This is a read adapter, not a publication,
 * classification or privileged executor. Actual verified original reviews
 * must still come from a separate, governed approval source.
 */
export function createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>): C09PublishedKnowledgeTopicAuthorityShadowV1 {
  const subject = input?.scope?.resolvedSubject;
  const client = input?.scope?.client;
  if (!subject || subject.subjectKind !== 'member' ||
      !UUID.test(subject.subjectId) || typeof client?.query !== 'function') fail();

  return Object.freeze({
    async readPublishedTopic(request: Readonly<{ characterId: 'seyeon'; topicKey: string }>): Promise<unknown> {
      if (!request || request.characterId !== 'seyeon' ||
          typeof request.topicKey !== 'string' || !TOPIC.test(request.topicKey)) fail();
      try {
        const result = await client.query<Record<string, unknown>>(
          POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1, [request.topicKey],
        );
        if (result.rows.length !== 1) fail();
        const row = result.rows[0]!;
        if (row.characterId !== 'seyeon' || row.topicKey !== request.topicKey ||
            !bounded(row.policyVersion) || !bounded(row.authoritySourceRef) ||
            row.revokedAt !== null) fail();
        const publishedAt = time(row.publishedAt);
        if (Date.parse(publishedAt) > Date.now()) fail();

        return Object.freeze({
          characterId: 'seyeon' as const,
          topicKey: request.topicKey,
          policyVersion: row.policyVersion,
          authoritySourceRef: row.authoritySourceRef,
          publishedAt,
          revokedAt: null,
        });
      } catch {
        return fail();
      }
    },
  });
}
