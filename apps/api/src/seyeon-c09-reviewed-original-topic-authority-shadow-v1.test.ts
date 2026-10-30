import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonC09ReviewedOriginalTopicAuthorityShadowV1,
} from './seyeon-c09-reviewed-original-topic-authority-shadow-v1.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE = '11111111-1111-4111-8111-111111111111';
const ORIGINAL = '2026-10-28T03:00:00.000Z';
const LEARNED = '2026-10-29T02:00:00.000Z';
const VALID = '2026-10-29T03:00:00.000Z';
const REVIEWED = '2026-10-29T04:00:00.000Z';
const NOW = '2026-10-30T05:00:00.000Z';
const HASH = 'original-message-hash-from-db';
const REQUEST = {
  subjectId: SUBJECT,
  messageId: MESSAGE,
  originalContentHash: HASH,
  originalBodyText: 'I can teach you about this Python topic.',
  originalCreatedAt: ORIGINAL,
};

function fixture(input: {
  review?: unknown;
  topic?: unknown;
  reviewError?: Error;
  topicError?: Error;
} = {}) {
  const approved = {
    reviewRef: 'c09:review:approved-123',
    status: 'approved',
    visibility: 'user_private',
    characterId: 'seyeon',
    subjectId: SUBJECT,
    originalMessageId: MESSAGE,
    originalContentHash: HASH,
    topicKey: 'python.programming',
    awareness: 'heard_of',
    learnedAt: LEARNED,
    validAt: VALID,
    reviewedAt: REVIEWED,
  };
  const topic = {
    characterId: 'seyeon',
    topicKey: 'python.programming',
    policyVersion: 'reviewed-policy-v1',
    authoritySourceRef: 'approved-canon-topic-source',
    publishedAt: '2026-10-27T00:00:00.000Z',
    revokedAt: null,
  };
  const readIndependentlyApprovedOriginal = vi.fn(async () => {
    if (input.reviewError) throw input.reviewError;
    return input.review === undefined ? approved : input.review;
  });
  const readPublishedTopic = vi.fn(async () => {
    if (input.topicError) throw input.topicError;
    return input.topic === undefined ? topic : input.topic;
  });
  const authority = createSeyeonC09ReviewedOriginalTopicAuthorityShadowV1({
    approvedOriginals: { readIndependentlyApprovedOriginal },
    publishedTopics: { readPublishedTopic },
    now: () => new Date(NOW),
  });
  return { authority, readIndependentlyApprovedOriginal, readPublishedTopic, approved, topic };
}

describe('C09 independently reviewed private original topic boundary', () => {
  it('only emits a bounded decision after independent original and current published topic agree', async () => {
    const f = fixture();
    const decision = await f.authority.decide(REQUEST);
    expect(decision).toEqual({
      serverApproved: true,
      topicKey: 'python.programming',
      awareness: 'heard_of',
      learnedAt: LEARNED,
      validAt: VALID,
    });
    expect(f.readIndependentlyApprovedOriginal).toHaveBeenCalledExactlyOnceWith({
      subjectId: SUBJECT,
      originalMessageId: MESSAGE,
      originalContentHash: HASH,
    });
    expect(f.readPublishedTopic).toHaveBeenCalledExactlyOnceWith({
      characterId: 'seyeon', topicKey: 'python.programming',
    });
    expect(JSON.stringify(decision)).not.toContain(REQUEST.originalBodyText);
  });

  it.each([
    ['wrong owner', { subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
    ['wrong original', { originalMessageId: '22222222-2222-4222-8222-222222222222' }],
    ['changed original hash', { originalContentHash: 'different-hash' }],
    ['wrong character', { characterId: 'baekheon' }],
    ['sharing escalation', { visibility: 'character_shared' }],
    ['unreviewed', { status: 'pending' }],
    ['absent review reference', { reviewRef: null }],
    ['fabricated topic key', { topicKey: 'invented domain' }],
    ['future review', { reviewedAt: '2026-11-01T00:00:00.000Z' }],
    ['invalid date ordering', { validAt: ORIGINAL }],
  ])('fails closed for %s without reading published topic', async (_, change) => {
    const f = fixture();
    const bad = fixture({ review: { ...f.approved, ...change } });
    await expect(bad.authority.decide(REQUEST)).rejects.toMatchObject({
      code: 'C09_APPROVED_ORIGINAL_TOPIC_UNVERIFIED',
    });
    expect(bad.readPublishedTopic).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['wrong character', { characterId: 'baekheon' }],
    ['topic mismatch', { topicKey: 'other.topic' }],
    ['revoked', { revokedAt: '2026-10-29T00:00:00.000Z' }],
    ['not published', { publishedAt: null }],
    ['future published', { publishedAt: '2026-11-01T00:00:00.000Z' }],
    ['unknown policy', { authoritySourceRef: null }],
  ])('rejects %s topic authority without a positive decision', async (_, change) => {
    const base = fixture();
    const value = change === null ? null : { ...base.topic, ...change };
    const f = fixture({ topic: value });
    await expect(f.authority.decide(REQUEST)).rejects.toMatchObject({
      code: 'C09_APPROVED_ORIGINAL_TOPIC_UNVERIFIED',
    });
  });

  it('rejects missing or failed independent providers', async () => {
    expect(() => createSeyeonC09ReviewedOriginalTopicAuthorityShadowV1({
      approvedOriginals: null as any,
      publishedTopics: null as any,
    })).toThrow();
    const f = fixture({ reviewError: new Error('sensitive source read failed') });
    await expect(f.authority.decide(REQUEST)).rejects.toMatchObject({
      code: 'C09_APPROVED_ORIGINAL_TOPIC_UNVERIFIED',
    });
    expect(f.readPublishedTopic).not.toHaveBeenCalled();
    const topic = fixture({ topicError: new Error('sensitive SQL topic read') });
    await expect(topic.authority.decide(REQUEST)).rejects.toMatchObject({
      code: 'C09_APPROVED_ORIGINAL_TOPIC_UNVERIFIED',
    });
  });

  it('rejects caller-selected identity without using any authority', async () => {
    const f = fixture();
    await expect(f.authority.decide({ ...REQUEST, subjectId: 'not-a-uuid' }))
      .rejects.toMatchObject({ code: 'C09_APPROVED_ORIGINAL_TOPIC_UNVERIFIED' });
    expect(f.readIndependentlyApprovedOriginal).not.toHaveBeenCalled();
    expect(f.readPublishedTopic).not.toHaveBeenCalled();
  });
});
