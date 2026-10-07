import type { CharacterDisclosureCharacterIdV1 } from '../../../packages/character-content/src/character-disclosure-policy-v1.js';
import type {
  CharacterDisclosureRelationshipEvidenceV2,
  CharacterDisclosureRetrievedSourceV2,
} from '../../../packages/domain/src/character-disclosure-gate-v2.js';
import {
  runCharacterIntegrityPreflightV1,
  type CharacterIntegrityAuthorityResolverPortV1,
  type CharacterIntegrityClaimClassifierPortV1,
  type CharacterIntegrityPreflightResultV1,
} from './character-integrity-preflight-v1.js';
import {
  retrieveAllowedCharacterDisclosureSourcesV2,
  runCharacterDisclosurePreflightV2,
  type CharacterDisclosureFactAuthorityResolverPortV2,
  type CharacterDisclosurePreflightResultV2,
  type CharacterDisclosureSourceDescriptorPortV2,
  type CharacterDisclosureTopicClassifierPortV2,
  type CharacterPrivateSourceRetrieverPortV2,
} from './character-disclosure-preflight-v2.js';

export const CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1 =
  'character-governed-preflight-v1' as const;

export interface CharacterGovernedPreflightResultV1 {
  readonly schemaVersion: typeof CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1;
  readonly integrity: CharacterIntegrityPreflightResultV1;
  readonly disclosure: CharacterDisclosurePreflightResultV2;
  readonly retrievedPrivateSources: readonly CharacterDisclosureRetrievedSourceV2[];
}

export async function runCharacterGovernedPreflightV1(input: {
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly userMessageRef: string;
  readonly userText: string;
  readonly relationship: CharacterDisclosureRelationshipEvidenceV2;
  readonly integrity: Readonly<{
    readonly classifier: CharacterIntegrityClaimClassifierPortV1;
    readonly authorityResolver: CharacterIntegrityAuthorityResolverPortV1;
  }>;
  readonly disclosure: Readonly<{
    readonly classifier: CharacterDisclosureTopicClassifierPortV2;
    readonly sourceDescriptor: CharacterDisclosureSourceDescriptorPortV2;
    readonly factAuthorityResolver: CharacterDisclosureFactAuthorityResolverPortV2;
    readonly retriever: CharacterPrivateSourceRetrieverPortV2;
  }>;
}): Promise<CharacterGovernedPreflightResultV1> {
  const integrity = await runCharacterIntegrityPreflightV1({
    characterId: input.characterId,
    userMessageRef: input.userMessageRef,
    userText: input.userText,
    classifier: input.integrity.classifier,
    authorityResolver: input.integrity.authorityResolver,
  });

  const disclosure = await runCharacterDisclosurePreflightV2({
    characterId: input.characterId,
    userQuestion: input.userText,
    relationship: input.relationship,
    classifier: input.disclosure.classifier,
    sourceDescriptor: input.disclosure.sourceDescriptor,
    factAuthorityResolver: input.disclosure.factAuthorityResolver,
  });

  const retrievedPrivateSources = await retrieveAllowedCharacterDisclosureSourcesV2({
    preflight: disclosure,
    retriever: input.disclosure.retriever,
  });

  return Object.freeze({
    schemaVersion: CHARACTER_GOVERNED_PREFLIGHT_SCHEMA_VERSION_V1,
    integrity,
    disclosure,
    retrievedPrivateSources,
  });
}
