import type {
  C09PrivateLearningTopicAuthorityShadowV1,
  C09PrivateLearningTopicDecisionShadowV1,
} from './seyeon-c09-private-learning-optin-command-shadow-v1.js';

export const SEYEON_C09_REVIEWED_ORIGINAL_TOPIC_SHADOW_V1 =
  'seyeon-c09-reviewed-original-topic-shadow-v1' as const;

export class SeyeonC09ReviewedOriginalTopicHoldV1 extends Error {
  readonly code = 'C09_APPROVED_ORIGINAL_TOPIC_UNVERIFIED' as const;
  constructor() {
    super('Independent original review or current topic publication is not verified.');
    this.name = 'SeyeonC09ReviewedOriginalTopicHoldV1';
  }
}

const fail = (): never => { throw new SeyeonC09ReviewedOriginalTopicHoldV1(); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;
const AWARENESS = ['heard_of', 'basic', 'practiced', 'proficient'] as const;

/**
 * Both providers must be wired by the server to separately governed sources.
 * A model response, browser-supplied classification, or unreviewed Memory item
 * is NOT a permitted source. Neither provider is deployed by this adapter.
 */
export interface C09ReviewedOriginalSourceAuthorityShadowV1 {
  readIndependentlyApprovedOriginal(input: Readonly<{
    subjectId: string;
    originalMessageId: string;
    originalContentHash: string;
  }>): Promise<unknown>;
}

export interface C09PublishedKnowledgeTopicAuthorityShadowV1 {
  readPublishedTopic(input: Readonly<{
    characterId: 'seyeon';
    topicKey: string;
  }>): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

function canonicalIso(value: unknown, nowMs: number): number {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail();
  const d = new Date(value as string);
  if (d.toISOString() !== value || d.getTime() > nowMs) fail();
  return d.getTime();
}

function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value &&
    value.length > 0 && value.length <= 512;
}

/**
 * This is a guarded port implementation for the already-existing opt-in
 * Command. It only verifies provenance; it does not classify raw text,
 * invent knowledge, change Canon, or publish an evidence record.
 *
 * Approved-review authority and published Topic authority are both required.
 * Until a server-owned review source exists, there is no default/fallback
 * that can make this adapter approve a user message.
 */
export function createSeyeonC09ReviewedOriginalTopicAuthorityShadowV1(input: Readonly<{
  approvedOriginals: C09ReviewedOriginalSourceAuthorityShadowV1;
  publishedTopics: C09PublishedKnowledgeTopicAuthorityShadowV1;
  now?: () => Date;
}>): C09PrivateLearningTopicAuthorityShadowV1 {
  if (!input ||
      typeof input.approvedOriginals?.readIndependentlyApprovedOriginal !== 'function' ||
      typeof input.publishedTopics?.readPublishedTopic !== 'function' ||
      (input.now !== undefined && typeof input.now !== 'function')) fail();

  return Object.freeze({
    async decide(request: Parameters<C09PrivateLearningTopicAuthorityShadowV1['decide']>[0]): Promise<C09PrivateLearningTopicDecisionShadowV1> {
      try {
        if (!request || !UUID.test(request.subjectId) ||
            !UUID.test(request.messageId) ||
            !bounded(request.originalContentHash) ||
            typeof request.originalBodyText !== 'string' ||
            !request.originalBodyText.trim()) fail();

        const now = input.now?.() ?? new Date();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail();
        const nowMs = now.getTime();
        const originalCreated = canonicalIso(request.originalCreatedAt, nowMs);

        const approved = record(await input.approvedOriginals.readIndependentlyApprovedOriginal({
          subjectId: request.subjectId,
          originalMessageId: request.messageId,
          originalContentHash: request.originalContentHash,
        }));

        // The independent review must be a source-owned private approval of
        // this exact original revision, not a merely plausible topic label.
        if (approved.status !== 'approved' ||
            approved.visibility !== 'user_private' ||
            approved.characterId !== 'seyeon' ||
            approved.subjectId !== request.subjectId ||
            approved.originalMessageId !== request.messageId ||
            approved.originalContentHash !== request.originalContentHash ||
            !bounded(approved.reviewRef) ||
            typeof approved.topicKey !== 'string' || !TOPIC.test(approved.topicKey) ||
            !AWARENESS.includes(approved.awareness as typeof AWARENESS[number])) fail();

        const learnedAt = canonicalIso(approved.learnedAt, nowMs);
        const validAt = canonicalIso(approved.validAt, nowMs);
        const reviewedAt = canonicalIso(approved.reviewedAt, nowMs);
        if (learnedAt < originalCreated ||
            learnedAt > validAt || validAt > reviewedAt ||
            reviewedAt < originalCreated) fail();

        const topic = record(await input.publishedTopics.readPublishedTopic({
          characterId: 'seyeon',
          topicKey: approved.topicKey as string,
        }));
        if (topic.characterId !== 'seyeon' ||
            topic.topicKey !== approved.topicKey ||
            !bounded(topic.policyVersion) ||
            !bounded(topic.authoritySourceRef) ||
            topic.revokedAt !== null) fail();

        // Require a currently published, non-revoked topic. Review date
        // alone does not create or extend topic publication authority.
        canonicalIso(topic.publishedAt, nowMs);

        return Object.freeze({
          serverApproved: true,
          topicKey: approved.topicKey as string,
          awareness: approved.awareness as typeof AWARENESS[number],
          learnedAt: approved.learnedAt as string,
          validAt: approved.validAt as string,
        });
      } catch {
        return fail();
      }
    },
  });
}
