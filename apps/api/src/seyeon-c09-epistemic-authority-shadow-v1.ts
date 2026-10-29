import {
  resolveSeyeonC09KnowledgeDecisionShadowV1,
  type SeyeonC09KnowledgeEvidenceShadowV1,
  type SeyeonC09KnowledgePolicyShadowV1,
  type SeyeonC09KnowledgeRequestKindV1,
} from '../../../packages/domain/src/seyeon-c09-epistemic-resolver-shadow-v1.js';
import type {
  SeyeonC09KnowledgeDecisionAuthorityShadowPortV1,
} from './seyeon-c09-continuity-shadow-v1.js';

export const SEYEON_C09_EPISTEMIC_AUTHORITY_SHADOW_VERSION_V1 =
  'seyeon-c09-epistemic-authority-shadow-v1' as const;

export class SeyeonC09EpistemicAuthorityHoldV1 extends Error {
  readonly code = 'C09_EPISTEMIC_SOURCE_UNVERIFIABLE' as const;
  constructor() {
    super('C09 epistemic evidence is not independently authorized.');
    this.name = 'SeyeonC09EpistemicAuthorityHoldV1';
  }
}

/** Source-owned request classification; never accept the model's topic guess. */
export interface SeyeonC09ServerTurnTopicV1 {
  readonly subjectId: string;
  readonly currentUserMessageId: string;
  readonly topicKey: string;
  readonly requestKind: SeyeonC09KnowledgeRequestKindV1;
  readonly asOfTurn: string;
}

/**
 * This is a server-side READ contract, not a new DB table.
 * A production implementation must obtain its source from a governed
 * learning ledger with independent approval, revocation, and visibility
 * enforcement. Existing per-user memory_items alone is NOT that ledger.
 */
export interface SeyeonC09ApprovedLearningReadAuthorityV1 {
  readServerClassifiedTurn(input: Readonly<{
    subjectId: string;
    currentUserMessageId: string;
  }>): Promise<SeyeonC09ServerTurnTopicV1>;
  readAuthoritativeTopicPolicy(input: Readonly<{
    characterId: 'seyeon';
    topicKey: string;
  }>): Promise<SeyeonC09KnowledgePolicyShadowV1 | null>;
  readVerifiedLearningHistory(input: Readonly<{
    characterId: 'seyeon';
    topicKey: string;
    subjectId: string;
    asOfTurn: string;
  }>): Promise<readonly SeyeonC09KnowledgeEvidenceShadowV1[]>;
  /**
   * Verify every evidence ID independently of its projection. Must prove
   * provenance, grant, privacy review, and active revocation status.
   */
  verifyLearningEvidence(input: Readonly<{
    characterId: 'seyeon';
    evidenceId: string;
    authorityRef: string;
    subjectId: string;
    topicKey: string;
    asOfTurn: string;
    expectedEvidence: SeyeonC09KnowledgeEvidenceShadowV1;
  }>): Promise<boolean>;
}

const TOPIC = /^[a-z][a-z0-9_.-]{0,127}$/u;

function fail(): never {
  throw new SeyeonC09EpistemicAuthorityHoldV1();
}

/**
 * Production-safe by default: no approved policy means no inferred baseline
 * or LLM-derived expert knowledge. Does not write, share, or publish lessons.
 */
export function createSeyeonC09EpistemicAuthorityShadowPortV1(input: Readonly<{
  subjectId: string;
  authority: SeyeonC09ApprovedLearningReadAuthorityV1;
}>): SeyeonC09KnowledgeDecisionAuthorityShadowPortV1 {
  if (!input || typeof input.subjectId !== 'string' ||
      !input.subjectId.trim() || input.subjectId !== input.subjectId.trim() ||
      !input.authority ||
      typeof input.authority.readServerClassifiedTurn !== 'function' ||
      typeof input.authority.readAuthoritativeTopicPolicy !== 'function' ||
      typeof input.authority.readVerifiedLearningHistory !== 'function' ||
      typeof input.authority.verifyLearningEvidence !== 'function') fail();

  const subjectId = input.subjectId;
  const authority = input.authority;

  return Object.freeze({
    subjectId,
    async readCurrentKnowledgeDecision(request: Readonly<{
      subjectId: string;
      currentUserMessageId: string;
    }>) {
      if (!request || request.subjectId !== subjectId ||
          typeof request.currentUserMessageId !== 'string' ||
          request.currentUserMessageId.length === 0) fail();

      try {
        const turn = await authority.readServerClassifiedTurn({
          subjectId,
          currentUserMessageId: request.currentUserMessageId,
        });
        if (!turn || turn.subjectId !== subjectId ||
            turn.currentUserMessageId !== request.currentUserMessageId ||
            typeof turn.topicKey !== 'string' || !TOPIC.test(turn.topicKey) ||
            !['general_question', 'technical_execution', 'learning_offer'].includes(turn.requestKind) ||
            typeof turn.asOfTurn !== 'string') fail();

        const policy = await authority.readAuthoritativeTopicPolicy({
          characterId: 'seyeon',
          topicKey: turn.topicKey,
        });
        // Unclassified/undefined Canon topic is NOT "explicit_unaware".
        if (!policy || policy.characterId !== 'seyeon' ||
            policy.topicKey !== turn.topicKey) fail();

        const history = await authority.readVerifiedLearningHistory({
          characterId: 'seyeon',
          topicKey: turn.topicKey,
          subjectId,
          asOfTurn: turn.asOfTurn,
        });
        if (!Array.isArray(history) || history.length > 64) fail();
        for (const evidence of history) {
          if (!evidence || evidence.characterId !== 'seyeon' ||
              evidence.topicKey !== turn.topicKey ||
              evidence.verifiedByServer !== true ||
              evidence.visibility === 'user_private' && evidence.subjectId !== subjectId) {
            fail();
          }
          const verified = await authority.verifyLearningEvidence({
            characterId: 'seyeon',
            evidenceId: evidence.evidenceId,
            authorityRef: evidence.authorityRef,
            subjectId,
            topicKey: turn.topicKey,
            asOfTurn: turn.asOfTurn,
            expectedEvidence: evidence,
          });
          if (verified !== true) fail();
        }
        return resolveSeyeonC09KnowledgeDecisionShadowV1({
          policy,
          subjectId,
          requestKind: turn.requestKind,
          asOfTurn: turn.asOfTurn,
          evidence: history,
        });
      } catch {
        return fail();
      }
    },
  });
}
