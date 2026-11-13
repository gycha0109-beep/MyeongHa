// Watchtower-Track: character-memory
// Offline-only projection of already governed Integrity/Disclosure decisions.
// Never classifies claims, retrieves private sources or approves new authority.
import {
  CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1,
  type CharacterIntegrityPreflightResultV1,
} from './character-integrity-preflight-v1.js';
import {
  CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2,
  type CharacterDisclosurePreflightResultV2,
} from './character-disclosure-preflight-v2.js';
import {
  CHARACTER_INTEGRITY_DECISION_SCHEMA_VERSION_V1,
} from '../../../packages/domain/src/character-integrity-gate-v1.js';
import {
  CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V2,
} from '../../../packages/domain/src/character-disclosure-gate-v2.js';
import type {
  CharacterContextTrustedSourceV1,
} from '../../../packages/domain/src/character-dynamic-context-composer-v1.js';

export class CharacterGovernedPreflightContextHoldV1 extends Error {
  override readonly name = 'CharacterGovernedPreflightContextHoldV1';
  readonly code = 'GOVERNED_PREFLIGHT_CONTEXT_HELD' as const;
  constructor() {
    super('Governed preflight context is not pinned to this Character turn.');
  }
}

export type CharacterGovernedPreflightContextLayersV1 = Readonly<{
  readonly integrityClaimDecisions: readonly CharacterContextTrustedSourceV1[];
  readonly disclosureDecision?: CharacterContextTrustedSourceV1;
}>;

function held(): never {
  throw new CharacterGovernedPreflightContextHoldV1();
}

function isSafeId(id: unknown): id is string {
  return typeof id === 'string' &&
    id.length > 0 && id.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(id);
}

/**
 * Consumes ONLY results previously evaluated by the existing trusted server
 * preflight for this specific current User message. Its output STILL requires
 * positive source admission in the Dynamic Context Composer.
 *
 * Project decision classifications and boundaries, never claim statements,
 * private source bodies, Character Fact Authority rows or any protected Reading.
 */
export function buildCharacterGovernedPreflightContextLayersV1(input: Readonly<{
  characterId: string;
  currentUserMessageId: string;
  integrity: CharacterIntegrityPreflightResultV1;
  disclosure: CharacterDisclosurePreflightResultV2;
}>): CharacterGovernedPreflightContextLayersV1 {
  const { characterId, currentUserMessageId, integrity, disclosure } = input;
  if (!isSafeId(characterId) || !isSafeId(currentUserMessageId) ||
      integrity?.schemaVersion !== CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1 ||
      integrity.characterId !== characterId ||
      integrity.userMessageRef !== currentUserMessageId ||
      !Array.isArray(integrity.classification?.claims) ||
      !Array.isArray(integrity.decisions) ||
      integrity.decisions.length !== integrity.classification.claims.length ||
      integrity.decisions.length > 8 ||
      disclosure?.schemaVersion !== CHARACTER_DISCLOSURE_PREFLIGHT_SCHEMA_VERSION_V2) {
    held();
  }

  const integrityClaimDecisions = integrity.decisions.map((decision, index) => {
    const classification = integrity.classification.claims[index];
    if (
      decision?.schemaVersion !== CHARACTER_INTEGRITY_DECISION_SCHEMA_VERSION_V1 ||
      decision.claim.sourceRef !== currentUserMessageId ||
      !isSafeId(decision.claim.claimId) ||
      decision.claim.claimId !== classification?.claimId ||
      decision.claim.kind !== classification?.kind ||
      decision.claim.statement !== classification?.statement ||
      typeof decision.mayEnterWorkingContextAsFact !== 'boolean' ||
      typeof decision.mayEnterWorkingContextAsUserAssertion !== 'boolean' ||
      decision.mayMutateRelationshipState !== false ||
      decision.mayCreateRelationshipEvent !== false
    ) held();

    return Object.freeze({
      sourceRef: 'integrity:' + currentUserMessageId + ':' + (index + 1),
      text: JSON.stringify({
        claimId: decision.claim.claimId,
        claimKind: decision.claim.kind,
        result: decision.result,
        verifiedFactAllowed: decision.mayEnterWorkingContextAsFact,
        userAssertionAllowed: decision.mayEnterWorkingContextAsUserAssertion,
        // The claim statement is already present in the pinned User turn.
        // Do not elevate it via repeated, untrusted context duplication.
      }),
    });
  });

  if (disclosure.status === 'not_sensitive') {
    if (disclosure.decision !== null || disclosure.classification.topicKey !== null) {
      held();
    }
    return Object.freeze({
      integrityClaimDecisions: Object.freeze(integrityClaimDecisions),
    });
  }
  if (disclosure.status !== 'sensitive' ||
      disclosure.decision?.schemaVersion !== CHARACTER_DISCLOSURE_DECISION_SCHEMA_VERSION_V2 ||
      disclosure.decision.characterId !== characterId ||
      disclosure.decision.topicKey !== disclosure.classification.topicKey ||
      disclosure.decision.topicKey !== disclosure.source?.topicKey ||
      typeof disclosure.decision.authorityGap !== 'boolean' ||
      typeof disclosure.decision.knowledgeGap !== 'boolean') {
    held();
  }
  const decision = disclosure.decision;
  const disclosureDecision = Object.freeze({
    sourceRef: 'disclosure:' + currentUserMessageId,
    text: JSON.stringify({
      topicKey: decision.topicKey,
      result: decision.result,
      reasonCode: decision.reasonCode,
      disclosureDepth: decision.retrievalScope.depth,
      behaviorAction: decision.behaviorAction,
      authorityGap: decision.authorityGap,
      knowledgeGap: decision.knowledgeGap,
      privateSourceContentIncluded: false,
    }),
  });
  if (disclosureDecision.text.length > 8000) held();
  return Object.freeze({
    integrityClaimDecisions: Object.freeze(integrityClaimDecisions),
    disclosureDecision,
  });
}
