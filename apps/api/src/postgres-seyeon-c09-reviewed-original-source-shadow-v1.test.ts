import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import {
  createPostgresC09ReviewedOriginalSourceShadowV1,
  C09_POSTGRES_REVIEWED_ORIGINAL_SQL_V1,
} from './postgres-seyeon-c09-reviewed-original-source-shadow-v1.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MESSAGE = '11111111-1111-4111-8111-111111111111';
const HASH = 'trusted-original-hash';
const LEARNED = '2026-10-28T02:00:00.000Z';
const VALID = '2026-10-28T03:00:00.000Z';
const REVIEWED = '2026-10-29T04:00:00.000Z';
const REQUEST = { subjectId: OWNER, originalMessageId: MESSAGE, originalContentHash: HASH };

const row = {
  reviewRef: 'review:independent:1', subjectId: OWNER,
  originalMessageId: MESSAGE, originalContentHash: HASH,
  characterId: 'seyeon', topicKey: 'python.programming',
  awareness: 'heard_of', visibility: 'user_private',
  status: 'approved', reviewerRef: 'server-reviewer:1',
  reviewPolicyRef: 'review-policy:2026-10',
  learnedAt: new Date(LEARNED), validAt: new Date(VALID),
  reviewedAt: new Date(REVIEWED), revokedAt: null,
};

function fixture(opts: {
  rows?: readonly Record<string, unknown>[];
  subjectId?: string;
  kind?: 'member' | 'guest';
  error?: Error;
} = {}) {
  const query = vi.fn(async (_sql: string, _values?: readonly unknown[]) => {
    if (opts.error) throw opts.error;
    return { rows: opts.rows ?? [row] };
  });
  const scope = {
    resolvedSubject: {
      subjectKind: opts.kind ?? 'member',
      subjectId: opts.subjectId ?? OWNER,
    },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  return { query, scope };
}

describe('C09 independent approved original read-only Postgres source', () => {
  it('proves exact owner, original, hash, review provenance, private visibility and timestamps', async () => {
    const f = fixture();
    const reader = createPostgresC09ReviewedOriginalSourceShadowV1({ scope: f.scope });
    const result = await reader.readIndependentlyApprovedOriginal(REQUEST);
    expect(result).toEqual({
      status: 'approved', visibility: 'user_private', characterId: 'seyeon',
      subjectId: OWNER, originalMessageId: MESSAGE, originalContentHash: HASH,
      reviewRef: row.reviewRef, reviewerRef: row.reviewerRef,
      reviewPolicyRef: row.reviewPolicyRef, topicKey: 'python.programming',
      awareness: 'heard_of', learnedAt: LEARNED,
      validAt: VALID, reviewedAt: REVIEWED,
    });
    expect(f.query).toHaveBeenCalledExactlyOnceWith(
      C09_POSTGRES_REVIEWED_ORIGINAL_SQL_V1, [OWNER, MESSAGE, HASH],
    );
    expect(C09_POSTGRES_REVIEWED_ORIGINAL_SQL_V1).toContain('revoked_at is null');
    expect(C09_POSTGRES_REVIEWED_ORIGINAL_SQL_V1).not.toMatch(/for share|security definer|insert into/iu);
  });

  it('does not read any other Subject or Guest', async () => {
    const guest = fixture({ kind: 'guest' });
    expect(() => createPostgresC09ReviewedOriginalSourceShadowV1({ scope: guest.scope })).toThrow();
    const f = fixture();
    const reader = createPostgresC09ReviewedOriginalSourceShadowV1({ scope: f.scope });
    await expect(reader.readIndependentlyApprovedOriginal({ ...REQUEST, subjectId: OTHER }))
      .rejects.toMatchObject({ code: 'C09_INDEPENDENT_ORIGINAL_REVIEW_UNAVAILABLE' });
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each([
    ['absent', []],
    ['ambiguous', [row, row]],
    ['different owner', [{ ...row, subjectId: OTHER }]],
    ['changed original hash', [{ ...row, originalContentHash: 'changed' }]],
    ['unreviewed', [{ ...row, status: 'pending' }]],
    ['revoked', [{ ...row, status: 'revoked', revokedAt: REVIEWED }]],
    ['shared scope', [{ ...row, visibility: 'character_shared' }]],
    ['wrong character', [{ ...row, characterId: 'baekheon' }]],
    ['untrusted reviewer', [{ ...row, reviewerRef: '' }]],
    ['unknown review policy', [{ ...row, reviewPolicyRef: null }]],
    ['invalid topic', [{ ...row, topicKey: 'not a topic' }]],
    ['future review', [{ ...row, reviewedAt: '2099-01-01T00:00:00.000Z' }]],
    ['invalid learned timeline', [{ ...row, learnedAt: REVIEWED, validAt: LEARNED }]],
  ])('fails closed on %s current source', async (_, rows) => {
    const f = fixture({ rows });
    const reader = createPostgresC09ReviewedOriginalSourceShadowV1({ scope: f.scope });
    await expect(reader.readIndependentlyApprovedOriginal(REQUEST)).rejects.toMatchObject({
      code: 'C09_INDEPENDENT_ORIGINAL_REVIEW_UNAVAILABLE',
    });
  });

  it('maps missing proposal table, RLS denial or SQL fault into a safe Hold', async () => {
    const f = fixture({ error: new Error('sensitive postgres error for review table') });
    const reader = createPostgresC09ReviewedOriginalSourceShadowV1({ scope: f.scope });
    await expect(reader.readIndependentlyApprovedOriginal(REQUEST))
      .rejects.toMatchObject({ code: 'C09_INDEPENDENT_ORIGINAL_REVIEW_UNAVAILABLE' });
  });
});
