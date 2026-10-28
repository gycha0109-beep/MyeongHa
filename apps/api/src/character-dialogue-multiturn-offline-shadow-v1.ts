import { createHash } from 'node:crypto';
import {
  guardCharacterRendererOutput,
  type CharacterDialogueEnvelopeV1,
  type CharacterRendererDraftV1,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import type {
  CharacterDialogueContinuityPlanShadowV1,
  CharacterDialogueMessageShadowV1,
} from '../../../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import { assertEngineeringVerticalSliceMockExecution } from './mock-execution-boundary.js';
import { prepareCharacterDialogueAuthorizedShadowV1 } from
  './character-dialogue-continuity-authorized-shadow-v1.js';

export const CHARACTER_MULTITURN_OFFLINE_SHADOW_VERSION_V1 =
  'character-multiturn-offline-shadow-v1' as const;
const DECISION_V1 = 'character-multiturn-decision-shadow-v1' as const;
const DRAFT_V1 = 'character-multiturn-draft-shadow-v1' as const;
const REVIEW_V1 = 'character-multiturn-semantic-review-shadow-v1' as const;

export const CHARACTER_MULTITURN_SEMANTIC_FAILURE_CODES_V1 = Object.freeze([
  'UNSUPPORTED_MEMORY_CALLBACK',
  'HYPOTHESIS_PROMOTED_TO_FACT',
  'INTEGRITY_SCOPE_VIOLATION',
  'RELATIONSHIP_OVERREACH',
  'CROSS_CHARACTER_PRIVATE_MEMORY',
  'USER_AGENCY_CANONIZATION',
  'HELPFUL_ASSISTANT_COLLAPSE',
  'CHARACTER_VOICE_COLLAPSE',
  'RISK_ACTION_CAUSALITY_VIOLATION',
  'AUTHORITY_ABSTENTION_VIOLATION',
] as const);

export type CharacterMultiturnSemanticFailureCodeV1 =
  (typeof CHARACTER_MULTITURN_SEMANTIC_FAILURE_CODES_V1)[number];

export interface CharacterMultiturnDecisionShadowV1 {
  readonly schemaVersion: typeof DECISION_V1;
  readonly characterId: string;
  readonly currentUserMessageRef: string;
  readonly noticeEvidenceRefs: readonly string[];
  readonly presentWant: string;
  readonly tension: string;
  readonly chosenAction: string;
  readonly rationale: string;
  readonly memoryRefsUsed: readonly [];
  readonly disclosureLevel: 'public';
}

export interface CharacterMultiturnDraftShadowV1 {
  readonly schemaVersion: typeof DRAFT_V1;
  readonly characterId: string;
  readonly utterance: string;
  readonly memoryRefsMentioned: readonly [];
  readonly privateSourceRefsMentioned: readonly [];
  readonly cosmetic: CharacterRendererDraftV1;
}

export interface CharacterMultiturnSemanticReviewShadowV1 {
  readonly schemaVersion: typeof REVIEW_V1;
  readonly characterId: string;
  readonly reviewedUtteranceHash: string;
  readonly reviewedDecisionHash: string;
  readonly failureCodes: readonly CharacterMultiturnSemanticFailureCodeV1[];
  readonly evidence: readonly Readonly<{
    readonly code: CharacterMultiturnSemanticFailureCodeV1;
    readonly excerpt: string;
    readonly reason: string;
  }>[];
}

interface ShadowProviderIdentityV1 {
  readonly providerKey: string;
  readonly modelKey: string;
}

export interface CharacterMultiturnDecisionProviderShadowV1 extends ShadowProviderIdentityV1 {
  decide(input: Readonly<{
    plan: CharacterDialogueContinuityPlanShadowV1;
    conversation: readonly CharacterDialogueMessageShadowV1[];
    allowedEmotionIds: readonly string[];
  }>): unknown | Promise<unknown>;
}

export interface CharacterMultiturnRendererProviderShadowV1 extends ShadowProviderIdentityV1 {
  render(input: Readonly<{
    plan: CharacterDialogueContinuityPlanShadowV1;
    decision: CharacterMultiturnDecisionShadowV1;
    conversation: readonly CharacterDialogueMessageShadowV1[];
  }>): unknown | Promise<unknown>;
}

export interface CharacterMultiturnReviewerProviderShadowV1 extends ShadowProviderIdentityV1 {
  review(input: Readonly<{
    plan: CharacterDialogueContinuityPlanShadowV1;
    decision: CharacterMultiturnDecisionShadowV1;
    utterance: string;
    utteranceHash: string;
    decisionHash: string;
    conversation: readonly CharacterDialogueMessageShadowV1[];
    reviewCriteria: readonly string[];
  }>): unknown | Promise<unknown>;
}

export interface CharacterMultiturnReviewedCandidateShadowV1 {
  readonly version: typeof CHARACTER_MULTITURN_OFFLINE_SHADOW_VERSION_V1;
  readonly scope: 'TEST_ONLY_REVIEWED_CANDIDATE_NOT_PRODUCTION';
  readonly characterId: string;
  readonly sourceContentReleaseId: string;
  readonly sourceContentBundleId: string;
  readonly sourceContentRevision: number;
  readonly sourceContentVersion: string;
  readonly decision: CharacterMultiturnDecisionShadowV1;
  readonly draft: CharacterMultiturnDraftShadowV1;
  readonly cosmeticEnvelope: CharacterDialogueEnvelopeV1;
  readonly semanticReview: CharacterMultiturnSemanticReviewShadowV1;
  readonly mayCommit: false;
  readonly mayReveal: false;
  readonly mayCreateMemory: false;
  readonly mayModifyRelationship: false;
}

export class CharacterMultiturnOfflineShadowHoldV1 extends Error {
  readonly code = 'CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED' as const;
  constructor() {
    super('CHARACTER_MULTITURN_OFFLINE_SHADOW_REJECTED');
    this.name = 'CharacterMultiturnOfflineShadowHoldV1';
  }
}

const fail = (): never => { throw new CharacterMultiturnOfflineShadowHoldV1(); };
const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
function requireRecord(candidate: unknown): Record<string, unknown> {
  if (!isRecord(candidate)) throw new CharacterMultiturnOfflineShadowHoldV1();
  return candidate;
}
const exact = (x: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(x).length === keys.length &&
  Object.keys(x).every((key) => keys.includes(key));
const validText = (x: unknown, max = 1200): x is string =>
  typeof x === 'string' && x.trim().length > 0 &&
  x.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(x);
const empty = (x: unknown): x is readonly [] => Array.isArray(x) && x.length === 0;
const hash = (value: string): string =>
  'sha256:v1:' + createHash('sha256').update(value, 'utf8').digest('hex');

function guardDecision(
  candidate: unknown,
  plan: CharacterDialogueContinuityPlanShadowV1,
): CharacterMultiturnDecisionShadowV1 {
  const raw = requireRecord(candidate);
  if (!exact(raw, [
    'schemaVersion', 'characterId', 'currentUserMessageRef',
    'noticeEvidenceRefs', 'presentWant', 'tension', 'chosenAction',
    'rationale', 'memoryRefsUsed', 'disclosureLevel',
  ]) ||
    raw.schemaVersion !== DECISION_V1 ||
    raw.characterId !== plan.packet.characterId ||
    raw.currentUserMessageRef !== plan.packet.currentUserMessageRef ||
    !validText(raw.presentWant) || !validText(raw.tension) ||
    !validText(raw.chosenAction, 96) || !validText(raw.rationale) ||
    raw.disclosureLevel !== 'public' || !empty(raw.memoryRefsUsed) ||
    !Array.isArray(raw.noticeEvidenceRefs) ||
    raw.noticeEvidenceRefs.length < 1 ||
    raw.noticeEvidenceRefs.length > 8 ||
    new Set(raw.noticeEvidenceRefs).size !== raw.noticeEvidenceRefs.length ||
    !raw.noticeEvidenceRefs.includes(plan.packet.currentUserMessageRef) ||
    raw.noticeEvidenceRefs.some(
      (ref) => !plan.packet.recentMessageRefs.includes(ref),
    )) fail();
  return Object.freeze({
    schemaVersion: DECISION_V1,
    characterId: raw.characterId as string,
    currentUserMessageRef: raw.currentUserMessageRef as string,
    noticeEvidenceRefs: Object.freeze([...(raw.noticeEvidenceRefs as string[])]),
    presentWant: raw.presentWant as string,
    tension: raw.tension as string,
    chosenAction: raw.chosenAction as string,
    rationale: raw.rationale as string,
    memoryRefsUsed: Object.freeze([]) as readonly [],
    disclosureLevel: 'public' as const,
  });
}

function guardDraft(
  candidate: unknown,
  plan: CharacterDialogueContinuityPlanShadowV1,
  runtime: CharacterRuntimeContextV1,
): Readonly<{
  draft: CharacterMultiturnDraftShadowV1;
  cosmeticEnvelope: CharacterDialogueEnvelopeV1;
}> {
  const raw = requireRecord(candidate);
  if (!exact(raw, [
    'schemaVersion', 'characterId', 'utterance', 'memoryRefsMentioned',
    'privateSourceRefsMentioned', 'cosmetic',
  ]) || raw.schemaVersion !== DRAFT_V1 ||
    raw.characterId !== plan.packet.characterId ||
    !validText(raw.utterance) ||
    !empty(raw.memoryRefsMentioned) || !empty(raw.privateSourceRefsMentioned) ||
    !isRecord(raw.cosmetic) || !exact(raw.cosmetic, [
      'schemaVersion', 'emotion', 'memoryProposals',
      'relationshipEventProposals', 'suggestedActions',
    ]) ||
    !empty(raw.cosmetic.memoryProposals) ||
    !empty(raw.cosmetic.relationshipEventProposals) ||
    !empty(raw.cosmetic.suggestedActions)) fail();

  // Reuse the EXISTING common Character Output Guard for cosmetic output and
  // explicitly prohibit memory/relationship/event generation. This guard does
  // NOT semantically approve the utterance: independent review stays mandatory.
  const cosmeticEnvelope = guardCharacterRendererOutput({
    rawOutput: raw.cosmetic,
    context: runtime,
    allowedSuggestedActionKeys: [],
  });
  return Object.freeze({
    draft: Object.freeze({
      schemaVersion: DRAFT_V1,
      characterId: raw.characterId as string,
      utterance: raw.utterance as string,
      memoryRefsMentioned: Object.freeze([]) as readonly [],
      privateSourceRefsMentioned: Object.freeze([]) as readonly [],
      cosmetic: Object.freeze({ ...(raw.cosmetic as unknown as CharacterRendererDraftV1) }),
    }),
    cosmeticEnvelope,
  });
}

function guardReview(
  candidate: unknown,
  plan: CharacterDialogueContinuityPlanShadowV1,
  expectedUtteranceHash: string,
  expectedDecisionHash: string,
): CharacterMultiturnSemanticReviewShadowV1 {
  const raw = requireRecord(candidate);
  if (!exact(raw, [
    'schemaVersion', 'characterId', 'reviewedUtteranceHash',
    'reviewedDecisionHash', 'failureCodes', 'evidence',
  ]) || raw.schemaVersion !== REVIEW_V1 ||
    raw.characterId !== plan.packet.characterId ||
    raw.reviewedUtteranceHash !== expectedUtteranceHash ||
    raw.reviewedDecisionHash !== expectedDecisionHash ||
    !Array.isArray(raw.failureCodes) || !Array.isArray(raw.evidence) ||
    raw.failureCodes.length > 10 ||
    new Set(raw.failureCodes).size !== raw.failureCodes.length ||
    raw.failureCodes.some((code) =>
      !CHARACTER_MULTITURN_SEMANTIC_FAILURE_CODES_V1.includes(
        code as CharacterMultiturnSemanticFailureCodeV1,
      )) ||
    raw.evidence.length !== raw.failureCodes.length ||
    raw.evidence.some((item) =>
      !isRecord(item) || !exact(item, ['code', 'excerpt', 'reason']) ||
      !(raw.failureCodes as readonly unknown[]).includes(item.code) ||
      !validText(item.excerpt) || !validText(item.reason))
  ) fail();
  if ((raw.failureCodes as readonly unknown[]).length !== 0) fail();
  return Object.freeze({
    schemaVersion: REVIEW_V1,
    characterId: raw.characterId as string,
    reviewedUtteranceHash: expectedUtteranceHash,
    reviewedDecisionHash: expectedDecisionHash,
    failureCodes: Object.freeze([]),
    evidence: Object.freeze([]),
  });
}

export const CHARACTER_MULTITURN_REVIEW_CRITERIA_SHADOW_V1 = Object.freeze([
  'Review the actual spoken text independently, not the candidate self-report.',
  'Reject treating an assistant utterance as proof of an offscreen event or shared memory.',
  'Reject user allegations or quoted transcripts laundered into shared history.',
  'Reject disclosure, relationship escalation, private memory or unsupported Saju claims.',
  'Reject actions, biography, emotions or promises invented on behalf of the user.',
  'Reject conversational servility that discards the selected character own conflict and boundaries.',
  'Check natural voice against the server-authored character decision profile; do not demand a fixed line or forced initiative.',
] as const);

function identity(provider: ShadowProviderIdentityV1): string {
  if (!provider || !validText(provider.providerKey, 128) ||
      !validText(provider.modelKey, 128)) fail();
  return provider.providerKey + '/' + provider.modelKey;
}

/**
 * Development/test fixture orchestration only. It reuses C1 runtime, the
 * existing common Character Output Guard and subject-scoped read checks.
 * No Production integration, paid provider, memory writes or HTTP Reveal.
 */
export async function runCharacterDialogueMultiturnOfflineShadowV1(input: Readonly<{
  runtime: CharacterRuntimeContextV1;
  recentConversation: readonly CharacterDialogueMessageShadowV1[];
  threadId: string;
  scope: PostgresSubjectExecutionScopeV1;
  decider: CharacterMultiturnDecisionProviderShadowV1;
  renderer: CharacterMultiturnRendererProviderShadowV1;
  reviewer: CharacterMultiturnReviewerProviderShadowV1;
}>): Promise<CharacterMultiturnReviewedCandidateShadowV1> {
  assertEngineeringVerticalSliceMockExecution('runCharacterDialogueMultiturnOfflineShadowV1');
  const deciderId = identity(input.decider);
  const rendererId = identity(input.renderer);
  const reviewerId = identity(input.reviewer);
  if (reviewerId === deciderId || reviewerId === rendererId ||
      (input.reviewer as object) === input.decider ||
      (input.reviewer as object) === input.renderer ||
      typeof input.decider.decide !== 'function' ||
      typeof input.renderer.render !== 'function' ||
      typeof input.reviewer.review !== 'function') fail();

  const check = async () => prepareCharacterDialogueAuthorizedShadowV1({
    runtime: input.runtime,
    recentConversation: input.recentConversation,
    threadId: input.threadId,
    scope: input.scope,
  });
  try {
    const prepared = await check();
    const plan = prepared.dialoguePlan;
    const pinnedContent = Object.freeze({
      releaseId: prepared.sourceContentReleaseId,
      bundleId: prepared.sourceContentBundleId,
      revision: prepared.sourceContentRevision,
    });
    const recheck = async () => {
      const current = await check();
      if (current.sourceContentReleaseId !== pinnedContent.releaseId ||
          current.sourceContentBundleId !== pinnedContent.bundleId ||
          current.sourceContentRevision !== pinnedContent.revision ||
          current.sourceContentVersion !== prepared.sourceContentVersion) fail();
    };
    const decision = guardDecision(await input.decider.decide({
      plan, conversation: input.recentConversation,
      allowedEmotionIds: Object.freeze([...input.runtime.rendererPolicy.allowedEmotionIds]),
    }), plan);
    // Recheck actual DB-owned message bodies after an awaited decision stage.
    await recheck();
    const { draft, cosmeticEnvelope } = guardDraft(await input.renderer.render({
      plan, decision, conversation: input.recentConversation,
    }), plan, input.runtime);
    await recheck();
    const utteranceHash = hash(draft.utterance);
    const decisionHash = hash(JSON.stringify(decision));
    const semanticReview = guardReview(await input.reviewer.review({
      plan, decision, utterance: draft.utterance,
      utteranceHash, decisionHash, conversation: input.recentConversation,
      reviewCriteria: CHARACTER_MULTITURN_REVIEW_CRITERIA_SHADOW_V1,
    }), plan, utteranceHash, decisionHash);
    await recheck();
    return Object.freeze({
      version: CHARACTER_MULTITURN_OFFLINE_SHADOW_VERSION_V1,
      scope: 'TEST_ONLY_REVIEWED_CANDIDATE_NOT_PRODUCTION' as const,
      characterId: plan.packet.characterId,
      sourceContentReleaseId: pinnedContent.releaseId,
      sourceContentBundleId: pinnedContent.bundleId,
      sourceContentRevision: pinnedContent.revision,
      sourceContentVersion: prepared.sourceContentVersion,
      decision, draft, cosmeticEnvelope, semanticReview,
      mayCommit: false as const,
      mayReveal: false as const,
      mayCreateMemory: false as const,
      mayModifyRelationship: false as const,
    });
  } catch {
    return fail();
  }
}
