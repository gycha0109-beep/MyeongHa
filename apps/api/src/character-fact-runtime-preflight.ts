import {
  resolveCharacterRuntimeDisclosurePreflightV1,
  type CharacterRuntimeDisclosureDepthV1,
  type CharacterRuntimeDisclosureIneligibleResultV1,
  type CharacterRuntimeDisclosureRelationshipStageV1,
  type CharacterRuntimeDisclosureTrustBandV1,
  type CharacterRuntimeDisclosureDecisionV1,
} from '../../../packages/domain/src/index.js';
import {
  getCharacterFactRegistryAuthorityV1,
  type CharacterFactRegistryAuthorityRowV1,
  type CharacterFactRegistryReadAuthorityPortV1,
} from './character-fact-registry-authority.js';

export interface PrepareCharacterFactRuntimePreflightInputV1 {
  readonly releaseId: string;
  readonly characterId: string;
  readonly factKey: string;
  readonly relationshipStage: CharacterRuntimeDisclosureRelationshipStageV1;
  readonly trustBand: CharacterRuntimeDisclosureTrustBandV1;
  readonly minimumTrustBand?: CharacterRuntimeDisclosureTrustBandV1;
  readonly contextualEligibility: boolean;
  readonly characterSpecificBoundaryAllows: boolean;
  readonly requestedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly allowedDepth: CharacterRuntimeDisclosureDepthV1;
  readonly previouslyDisclosedDepth?: CharacterRuntimeDisclosureDepthV1;
  readonly ineligibleResult: CharacterRuntimeDisclosureIneligibleResultV1;
  readonly authorityPort: CharacterFactRegistryReadAuthorityPortV1;
}

export type CharacterFactRuntimePreflightV1 =
  | {
      readonly schemaVersion: 'v1';
      readonly status: 'knowledge_blocked';
      readonly fact: CharacterFactRegistryAuthorityRowV1;
      readonly reason: 'unknown_to_character';
      readonly retrieval: {
        readonly scope: 'none';
      };
    }
  | {
      readonly schemaVersion: 'v1';
      readonly status: 'disclosure_decided';
      readonly fact: CharacterFactRegistryAuthorityRowV1;
      readonly disclosure: CharacterRuntimeDisclosureDecisionV1;
    };

/**
 * Server-authoritative bridge:
 * pinned fact registry -> Character knowledge gate -> disclosure preflight.
 *
 * No private fact value is retrieved from any secondary store here. The
 * authority row itself is already the bounded compiled projection for the
 * exact pinned release / Character / fact key.
 */
export async function prepareCharacterFactRuntimePreflightV1(
  input: PrepareCharacterFactRuntimePreflightInputV1,
): Promise<CharacterFactRuntimePreflightV1> {
  const fact = await getCharacterFactRegistryAuthorityV1({
    releaseId: input.releaseId,
    characterId: input.characterId,
    factKey: input.factKey,
    authorityPort: input.authorityPort,
  });

  if (fact.characterKnowledge === 'UNKNOWN_TO_CHARACTER') {
    return Object.freeze({
      schemaVersion: 'v1',
      status: 'knowledge_blocked',
      fact,
      reason: 'unknown_to_character',
      retrieval: Object.freeze({ scope: 'none' as const }),
    });
  }

  const disclosure = resolveCharacterRuntimeDisclosurePreflightV1({
    topicKey: fact.factKey,
    sourceAuthorityState: fact.sourceAuthority,
    minimumDisclosureGate: fact.disclosureDefault,
    relationshipStage: input.relationshipStage,
    trustBand: input.trustBand,
    ...(input.minimumTrustBand === undefined
      ? {}
      : { minimumTrustBand: input.minimumTrustBand }),
    contextualEligibility: input.contextualEligibility,
    characterSpecificBoundaryAllows: input.characterSpecificBoundaryAllows,
    requestedDepth: input.requestedDepth,
    allowedDepth: input.allowedDepth,
    ...(input.previouslyDisclosedDepth === undefined
      ? {}
      : { previouslyDisclosedDepth: input.previouslyDisclosedDepth }),
    ineligibleResult: input.ineligibleResult,
  });

  return Object.freeze({
    schemaVersion: 'v1',
    status: 'disclosure_decided',
    fact,
    disclosure,
  });
}
