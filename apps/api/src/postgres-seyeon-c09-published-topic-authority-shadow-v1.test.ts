import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import {
  createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1,
  POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1,
} from './postgres-seyeon-c09-published-topic-authority-shadow-v1.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TOPIC = 'python.programming';
const PUBLISHED = '2026-10-29T00:00:00.000Z';

function fixture(input: {
  rows?: Record<string, unknown>[];
  queryError?: Error;
  guest?: boolean;
} = {}) {
  const query = vi.fn(async (_sql: string, _values?: readonly unknown[]) => {
    if (input.queryError) throw input.queryError;
    return {
      rows: input.rows ?? [{
        characterId: 'seyeon',
        topicKey: TOPIC,
        policyVersion: 'governed-policy-v1',
        authoritySourceRef: 'canon-topic-source',
        publishedAt: new Date(PUBLISHED),
        revokedAt: null,
      }],
    };
  });
  const scope = {
    resolvedSubject: { subjectId: OWNER, subjectKind: input.guest ? 'guest' : 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  return { scope, query };
}

describe('C09 PostgreSQL published topic read authority shadow', () => {
  it('reads only the matching currently published, unrevoked Topic inside member scope', async () => {
    const f = fixture();
    const authority = createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1({ scope: f.scope });
    expect(await authority.readPublishedTopic({ characterId: 'seyeon', topicKey: TOPIC })).toEqual({
      characterId: 'seyeon', topicKey: TOPIC,
      policyVersion: 'governed-policy-v1',
      authoritySourceRef: 'canon-topic-source',
      publishedAt: PUBLISHED, revokedAt: null,
    });
    expect(f.query).toHaveBeenCalledOnce();
    expect(f.query).toHaveBeenCalledWith(POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1, [TOPIC]);
    expect(POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1).toContain('published_at<=clock_timestamp()');
    expect(POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1).not.toContain('insert ');
    expect(POSTGRES_C09_PUBLISHED_TOPIC_SQL_V1).not.toContain('security definer');
  });

  it('does not allow a Guest to construct the governed Topic reader', () => {
    const f = fixture({ guest: true });
    expect(() => createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1({ scope: f.scope }))
      .toThrowError(/unavailable/u);
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each([
    ['no row', []],
    ['ambiguous duplicate', [{}, {}]],
    ['mismatched topic', [{
      characterId: 'seyeon', topicKey: 'different.topic',
      policyVersion: 'v1', authoritySourceRef: 'canon', publishedAt: PUBLISHED, revokedAt: null,
    }]],
    ['revoked', [{
      characterId: 'seyeon', topicKey: TOPIC,
      policyVersion: 'v1', authoritySourceRef: 'canon', publishedAt: PUBLISHED, revokedAt: PUBLISHED,
    }]],
    ['invalid policy', [{
      characterId: 'seyeon', topicKey: TOPIC,
      policyVersion: '', authoritySourceRef: 'canon', publishedAt: PUBLISHED, revokedAt: null,
    }]],
    ['future published', [{
      characterId: 'seyeon', topicKey: TOPIC,
      policyVersion: 'v1', authoritySourceRef: 'canon', publishedAt: '2099-10-29T00:00:00.000Z', revokedAt: null,
    }]],
  ])('rejects %s DB data', async (_, rows) => {
    const f = fixture({ rows });
    const authority = createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1({ scope: f.scope });
    await expect(authority.readPublishedTopic({ characterId: 'seyeon', topicKey: TOPIC }))
      .rejects.toMatchObject({ code: 'C09_PUBLISHED_TOPIC_UNAVAILABLE' });
  });

  it('does not trust caller-selected other Character or an arbitrary Topic key', async () => {
    const f = fixture();
    const authority = createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1({ scope: f.scope });
    await expect(authority.readPublishedTopic({
      characterId: 'baekheon' as 'seyeon', topicKey: TOPIC,
    })).rejects.toMatchObject({ code: 'C09_PUBLISHED_TOPIC_UNAVAILABLE' });
    await expect(authority.readPublishedTopic({
      characterId: 'seyeon', topicKey: 'not a valid topic',
    })).rejects.toMatchObject({ code: 'C09_PUBLISHED_TOPIC_UNAVAILABLE' });
    expect(f.query).not.toHaveBeenCalled();
  });

  it('fails closed and conceals raw SQL errors', async () => {
    const f = fixture({ queryError: new Error('private permission denied: postgres role') });
    const authority = createPostgresC09PublishedKnowledgeTopicAuthorityShadowV1({ scope: f.scope });
    await expect(authority.readPublishedTopic({ characterId: 'seyeon', topicKey: TOPIC }))
      .rejects.toMatchObject({ code: 'C09_PUBLISHED_TOPIC_UNAVAILABLE' });
  });
});
