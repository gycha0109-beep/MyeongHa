import { createHash } from 'node:crypto';
import {
  canonicalJson,
  guardCharacterRendererOutput,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import type { CharacterDialogueMessageShadowV1 } from
  '../../../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';
import { assertEngineeringVerticalSliceMockExecution } from './mock-execution-boundary.js';
import {
  prepareCharacterDialogueAuthorizedShadowV1,
} from './character-dialogue-continuity-authorized-shadow-v1.js';
import {
  CHARACTER_MULTITURN_OFFLINE_SHADOW_VERSION_V1,
  type CharacterMultiturnReviewedCandidateShadowV1,
} from './character-dialogue-multiturn-offline-shadow-v1.js';

export const CHARACTER_DIALOGUE_PRE_REVEAL_HOLD_SHADOW_V1 =
  'character-dialogue-pre-reveal-hold-shadow-v1' as const;

export class CharacterDialoguePreRevealHoldShadowErrorV1 extends Error {
  readonly code = 'CHARACTER_DIALOGUE_PRE_REVEAL_HOLD' as const;
  constructor() {
    super('CHARACTER_DIALOGUE_PRE_REVEAL_HOLD');
    this.name = 'CharacterDialoguePreRevealHoldShadowErrorV1';
  }
}

const fail = (): never => { throw new CharacterDialoguePreRevealHoldShadowErrorV1(); };
const hash = (s: string): string =>
  'sha256:v1:' + createHash('sha256').update(s, 'utf8').digest('hex');

export interface CharacterDialoguePreRevealAuditHoldShadowV1 {
  readonly version: typeof CHARACTER_DIALOGUE_PRE_REVEAL_HOLD_SHADOW_V1;
  readonly disposition: 'HOLD_NOT_AUTHORIZED_FOR_REVEAL';
  readonly reason: 'MISSING_ATOMIC_COMMIT_AND_LIVE_RIGHTS_REVEAL';
  readonly characterId: string;
  readonly sourceContentReleaseId: string;
  readonly sourceContentBundleId: string;
  readonly sourceContentRevision: number;
  readonly reviewedUtteranceHash: string;
  readonly reviewedDecisionHash: string;
  readonly requiresCommittedServerReceipt: true;
  readonly requiresLockedOriginalRightsAtSend: true;
  readonly requiresPostReviewGrantAndContentRevalidation: true;
  readonly mayCommit: false;
  readonly mayReveal: false;
  readonly mayUseCachedReviewForReveal: false;
}

/**
 * A final read-only audit, not a separate Character engine or a send route.
 * It compares an already-reviewed research candidate to a fresh, subject-owned
 * Postgres query and returns only HOLD metadata — never candidate utterance.
 *
 * Even a perfect review + live thread snapshot CANNOT establish atomic
 * committed-attempt lineage, source/grant freshness through the socket send,
 * or HTTP/proxy delivery. Those rights remain in the existing owned DB
 * commit/reveal machinery, not in this research helper.
 */
export async function auditCharacterDialoguePreRevealHoldShadowV1(input: Readonly<{
  candidate: CharacterMultiturnReviewedCandidateShadowV1;
  runtime: CharacterRuntimeContextV1;
  recentConversation: readonly CharacterDialogueMessageShadowV1[];
  scope: PostgresSubjectExecutionScopeV1;
  threadId: string;
}>): Promise<CharacterDialoguePreRevealAuditHoldShadowV1> {
  assertEngineeringVerticalSliceMockExecution(
    'auditCharacterDialoguePreRevealHoldShadowV1',
  );
  const c = input.candidate;
  const runtime = input.runtime;
  const last = input.recentConversation.at(-1);
  try {
    if (!c || !runtime || c.version !== CHARACTER_MULTITURN_OFFLINE_SHADOW_VERSION_V1 ||
        c.scope !== 'TEST_ONLY_REVIEWED_CANDIDATE_NOT_PRODUCTION' ||
        c.characterId !== runtime.characterId ||
        c.decision.characterId !== runtime.characterId ||
        c.draft.characterId !== runtime.characterId ||
        c.semanticReview.characterId !== runtime.characterId ||
        !last || last.role !== 'user' ||
        c.decision.currentUserMessageRef !== last.messageId ||
        !Array.isArray(c.decision.noticeEvidenceRefs) ||
        !c.decision.noticeEvidenceRefs.includes(last.messageId) ||
        c.decision.noticeEvidenceRefs.some(
          (ref) => !input.recentConversation.some((m) => m.messageId === ref),
        ) ||
        c.decision.disclosureLevel !== 'public' ||
        c.mayCommit !== false || c.mayReveal !== false ||
        c.mayCreateMemory !== false || c.mayModifyRelationship !== false ||
        !Array.isArray(c.decision.memoryRefsUsed) ||
        c.decision.memoryRefsUsed.length !== 0 ||
        !Array.isArray(c.draft.memoryRefsMentioned) ||
        c.draft.memoryRefsMentioned.length !== 0 ||
        !Array.isArray(c.draft.privateSourceRefsMentioned) ||
        c.draft.privateSourceRefsMentioned.length !== 0 ||
        !Array.isArray(c.semanticReview.failureCodes) ||
        c.semanticReview.failureCodes.length !== 0 ||
        !Array.isArray(c.semanticReview.evidence) ||
        c.semanticReview.evidence.length !== 0 ||
        typeof c.draft.utterance !== 'string' ||
        c.draft.utterance.trim().length === 0 ||
        c.draft.utterance.length > 1200 ||
        c.semanticReview.reviewedUtteranceHash !== hash(c.draft.utterance) ||
        c.semanticReview.reviewedDecisionHash !== hash(JSON.stringify(c.decision)) ||
        c.sourceContentBundleId !== runtime.contentBundleId) fail();

    const cosmetic = guardCharacterRendererOutput({
      rawOutput: c.draft.cosmetic,
      context: runtime,
      allowedSuggestedActionKeys: [],
    });
    if (canonicalJson(cosmetic) !== canonicalJson(c.cosmeticEnvelope)) fail();

    // A new server-owned read occurs after independent review. This detects
    // new messages or content revisions between candidate generation and the
    // final local audit; it is NOT an HTTP reveal time lock.
    const current = await prepareCharacterDialogueAuthorizedShadowV1({
      runtime, recentConversation: input.recentConversation,
      scope: input.scope, threadId: input.threadId,
    });
    if (current.characterId !== c.characterId ||
        current.sourceContentReleaseId !== c.sourceContentReleaseId ||
        current.sourceContentBundleId !== c.sourceContentBundleId ||
        current.sourceContentRevision !== c.sourceContentRevision ||
        current.sourceContentVersion !== c.sourceContentVersion ||
        current.dialoguePlan.packet.currentUserMessageRef !==
          c.decision.currentUserMessageRef) fail();

    // Intentionally never return utterance, actionable commit authority, or
    // a "successful reveal" status from a read-only Shadow check.
    return Object.freeze({
      version: CHARACTER_DIALOGUE_PRE_REVEAL_HOLD_SHADOW_V1,
      disposition: 'HOLD_NOT_AUTHORIZED_FOR_REVEAL' as const,
      reason: 'MISSING_ATOMIC_COMMIT_AND_LIVE_RIGHTS_REVEAL' as const,
      characterId: c.characterId,
      sourceContentReleaseId: c.sourceContentReleaseId,
      sourceContentBundleId: c.sourceContentBundleId,
      sourceContentRevision: c.sourceContentRevision,
      reviewedUtteranceHash: c.semanticReview.reviewedUtteranceHash,
      reviewedDecisionHash: c.semanticReview.reviewedDecisionHash,
      requiresCommittedServerReceipt: true as const,
      requiresLockedOriginalRightsAtSend: true as const,
      requiresPostReviewGrantAndContentRevalidation: true as const,
      mayCommit: false as const,
      mayReveal: false as const,
      mayUseCachedReviewForReveal: false as const,
    });
  } catch {
    return fail();
  }
}
