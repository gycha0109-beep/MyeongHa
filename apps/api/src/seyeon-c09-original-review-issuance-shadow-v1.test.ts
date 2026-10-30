import { describe, expect, it, vi } from 'vitest';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import {
  C09_ISSUE_ORIGINAL_REVIEW_SQL_V1,
  createSeyeonC09OriginalReviewIssuanceShadowV1,
} from './seyeon-c09-original-review-issuance-shadow-v1.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MESSAGE = '11111111-1111-4111-8111-111111111111';
const REVIEW = 'c09:review:independent:1';
const LEARNED = '2026-10-28T02:00:00.000Z';
const VALID = '2026-10-29T02:00:00.000Z';
const verified = Object.freeze({
  verification: 'independently_verified_by_server',
  status: 'approved', subjectId: OWNER, originalMessageId: MESSAGE,
  originalContentHash: 'source-message-hash',
  reviewRef: REVIEW, reviewerRef: 'reviewer:server:1',
  reviewPolicyRef: 'policy:review:1', topicKey: 'python.programming',
  awareness: 'basic', learnedAt: LEARNED, validAt: VALID,
});

function fixture(options: {
  evidence?: unknown;
  error?: Error;
  dbError?: Error;
  dbRows?: unknown[];
  kind?: 'member' | 'guest';
} = {}) {
  const verifyOriginalReview = vi.fn(async () => {
    if (options.error) throw options.error;
    return options.evidence === undefined ? verified : options.evidence;
  });
  const query = vi.fn(async (_sql: string, _args: readonly unknown[]) => {
    if (options.dbError) throw options.dbError;
    return { rows: options.dbRows ?? [{ reviewRef: REVIEW }] };
  });
  const scope = {
    resolvedSubject: { subjectId: OWNER, subjectKind: options.kind ?? 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;
  const reviewVerification = { verifyOriginalReview };
  const issuer = () => createSeyeonC09OriginalReviewIssuanceShadowV1({
    scope, reviewVerification,
  });
  return { issuer, verifyOriginalReview, query, scope };
}

describe('C09 independently verified original-review issuance, unmounted shadow', () => {
  it('issues via the dedicated SQL boundary after independent server verification', async () => {
    const f = fixture();
    expect(await f.issuer().issue(MESSAGE)).toEqual({
      version: 'seyeon-c09-original-review-issuance-shadow-v1',
      reviewRef: REVIEW, scope: 'user_private',
      optInIssued: false, learningPublished: false, productionActivated: false,
    });
    expect(f.verifyOriginalReview).toHaveBeenCalledExactlyOnceWith({
      canonicalSubjectId: OWNER, originalMessageId: MESSAGE,
    });
    expect(f.query).toHaveBeenCalledExactlyOnceWith(
      C09_ISSUE_ORIGINAL_REVIEW_SQL_V1,
      [OWNER, MESSAGE, 'source-message-hash', REVIEW,
        'python.programming', 'basic', 'reviewer:server:1',
        'policy:review:1', LEARNED, VALID],
    );
    expect(C09_ISSUE_ORIGINAL_REVIEW_SQL_V1).not.toMatch(/security definer|grant /iu);
  });

  it('refuses Guest and unverified input before any verifier or query', async () => {
    const f = fixture({ kind: 'guest' });
    expect(f.issuer).toThrow();
    expect(f.verifyOriginalReview).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled();

    const member = fixture();
    await expect(member.issuer().issue('not-a-uuid')).rejects.toMatchObject({
      code: 'C09_INDEPENDENT_REVIEW_ISSUANCE_UNAVAILABLE',
    });
    expect(member.verifyOriginalReview).not.toHaveBeenCalled();
  });

  it.each([
    ['absent verification', null],
    ['client-injected field', { ...verified, visibility: 'character_shared' }],
    ['unverified client claim', { ...verified, verification: 'member_says_yes' }],
    ['pending review', { ...verified, status: 'pending' }],
    ['wrong owner', { ...verified, subjectId: OTHER }],
    ['wrong original', { ...verified, originalMessageId: OTHER }],
    ['no original hash', { ...verified, originalContentHash: '' }],
    ['missing reviewer', { ...verified, reviewerRef: '' }],
    ['invalid policy', { ...verified, reviewPolicyRef: null }],
    ['wrong topic', { ...verified, topicKey: 'not a topic' }],
    ['invalid awareness', { ...verified, awareness: 'expert' }],
    ['future proof', { ...verified, validAt: '2099-10-30T02:00:00.000Z' }],
    ['invalid time ordering', { ...verified, learnedAt: VALID, validAt: LEARNED }],
  ])('fails closed on %s without issuing SQL', async (_, evidence) => {
    const f = fixture({ evidence });
    await expect(f.issuer().issue(MESSAGE)).rejects.toMatchObject({
      code: 'C09_INDEPENDENT_REVIEW_ISSUANCE_UNAVAILABLE',
    });
    expect(f.query).not.toHaveBeenCalled();
  });

  it('never reports issuance when DB result is missing, ambiguous or changed', async () => {
    for (const rows of [[], [{ reviewRef: REVIEW }, { reviewRef: REVIEW }], [{ reviewRef: 'other' }]]) {
      const f = fixture({ dbRows: rows });
      await expect(f.issuer().issue(MESSAGE)).rejects.toMatchObject({
        code: 'C09_INDEPENDENT_REVIEW_ISSUANCE_UNAVAILABLE',
      });
    }
  });

  it('normalizes verifier and DB failures without exposing private details', async () => {
    for (const f of [
      fixture({ error: new Error('private reviewer credential unavailable') }),
      fixture({ dbError: new Error('postgres missing review proposal') }),
    ]) {
      await expect(f.issuer().issue(MESSAGE)).rejects.toMatchObject({
        code: 'C09_INDEPENDENT_REVIEW_ISSUANCE_UNAVAILABLE',
      });
    }
  });
});
