import {
  getServerPreparedChatReceiveContentEntryV1,
} from './chat-receive.js';
import {
  getCharacterFactRegistryAuthorityV1,
  type CharacterFactRegistryReadAuthorityPortV1,
} from './character-fact-registry-authority.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from './character-standard-reading-chat-turn-preflight.js';

export type CharacterPublicFactChatReadBlockedReasonV1 =
  | 'source_authority_unresolved'
  | 'unknown_to_character'
  | 'partial_knowledge_projection_unresolved'
  | 'character_knowledge_not_applicable'
  | 'relationship_disclosure_authority_unresolved'
  | 'never_disclose'
  | 'disclosure_not_applicable';

export type CharacterPublicFactChatReadV1 =
  | {
      readonly schemaVersion: 'v1';
      readonly status: 'available';
      readonly characterId: string;
      readonly releaseId: string;
      readonly factKey: string;
      readonly sourceAuthority: 'CANON' | 'SOFT_CANON';
      readonly value: unknown;
      readonly provenance: {
        readonly sourceSection: string;
        readonly sourceBibleDocument: string;
        readonly sourceBibleRevision: string;
      };
    }
  | {
      readonly schemaVersion: 'v1';
      readonly status: 'blocked';
      readonly characterId: string;
      readonly releaseId: string;
      readonly factKey: string;
      readonly reason: CharacterPublicFactChatReadBlockedReasonV1;
    };

export class CharacterPublicFactChatReadErrorV1 extends Error {
  override readonly name = 'CharacterPublicFactChatReadErrorV1';

  constructor(message: string) {
    super(message);
  }
}

function exactReaderCharacterId(
  preflight: CharacterStandardReadingChatTurnPreflightV1,
): string {
  // This call also proves that the receive plan came from server receive authority.
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(
    preflight.receivePlan,
  );

  const { threadBinding, context } = preflight.runtime;
  if (
    threadBinding.activeContentReleaseId !== preflight.receivePlan.resolvedContent.releaseId ||
    threadBinding.activeContentReleaseId !== contentEntry.release.releaseId
  ) {
    throw new CharacterPublicFactChatReadErrorV1(
      'Character public fact read release provenance is inconsistent.',
    );
  }
  if (
    threadBinding.activeContentBundleId !== preflight.receivePlan.resolvedContent.bundleId ||
    threadBinding.activeContentBundleId !== contentEntry.release.bundleId
  ) {
    throw new CharacterPublicFactChatReadErrorV1(
      'Character public fact read bundle provenance is inconsistent.',
    );
  }
  if (
    threadBinding.participantCharacterIds.length !== 1 ||
    threadBinding.participantCharacterIds[0] === undefined
  ) {
    throw new CharacterPublicFactChatReadErrorV1(
      'Character public fact read requires an active single-Character thread.',
    );
  }

  const characterId = threadBinding.participantCharacterIds[0];
  if (context.characterId !== characterId) {
    throw new CharacterPublicFactChatReadErrorV1(
      'Character public fact read context does not match the active thread Character.',
    );
  }

  return characterId;
}

function blocked(input: {
  readonly characterId: string;
  readonly releaseId: string;
  readonly factKey: string;
  readonly reason: CharacterPublicFactChatReadBlockedReasonV1;
}): CharacterPublicFactChatReadV1 {
  return Object.freeze({
    schemaVersion: 'v1',
    status: 'blocked',
    ...input,
  });
}

/**
 * Safest live bridge while SRC-22 relationship stage authority remains OPEN.
 *
 * A fact selector is not authority. The exact fact is re-read from the
 * release-pinned server registry. Only facts that require no relationship-stage
 * interpretation are admitted: PUBLIC + KNOWN + resolved source authority.
 *
 * Sensitive relationship-gated facts fail closed until the source-approved
 * internal stage vocabulary / disclosure mapping exists.
 */
export async function readCharacterPublicFactForStandardReadingChatV1(input: {
  readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  readonly factKey: string;
  readonly authorityPort: CharacterFactRegistryReadAuthorityPortV1;
}): Promise<CharacterPublicFactChatReadV1> {
  const characterId = exactReaderCharacterId(input.preflight);
  const releaseId = input.preflight.runtime.threadBinding.activeContentReleaseId;

  const fact = await getCharacterFactRegistryAuthorityV1({
    releaseId,
    characterId,
    factKey: input.factKey,
    authorityPort: input.authorityPort,
  });

  if (
    fact.sourceAuthority === 'AUTHOR_UNDEFINED' ||
    fact.sourceAuthority === 'INTENTIONALLY_OPEN' ||
    fact.sourceAuthority === 'WORLD_DEPENDENT'
  ) {
    return blocked({
      characterId,
      releaseId,
      factKey: fact.factKey,
      reason: 'source_authority_unresolved',
    });
  }

  switch (fact.characterKnowledge) {
    case 'UNKNOWN_TO_CHARACTER':
      return blocked({
        characterId,
        releaseId,
        factKey: fact.factKey,
        reason: 'unknown_to_character',
      });
    case 'PARTIAL':
      return blocked({
        characterId,
        releaseId,
        factKey: fact.factKey,
        reason: 'partial_knowledge_projection_unresolved',
      });
    case 'NOT_APPLICABLE':
      return blocked({
        characterId,
        releaseId,
        factKey: fact.factKey,
        reason: 'character_knowledge_not_applicable',
      });
    case 'KNOWN':
      break;
  }

  switch (fact.disclosureDefault) {
    case 'NEVER':
      return blocked({
        characterId,
        releaseId,
        factKey: fact.factKey,
        reason: 'never_disclose',
      });
    case 'NOT_APPLICABLE':
      return blocked({
        characterId,
        releaseId,
        factKey: fact.factKey,
        reason: 'disclosure_not_applicable',
      });
    case 'FAMILIAR':
    case 'ATTACHED':
    case 'DEEP_TRUST':
    case 'CONTEXTUAL':
      return blocked({
        characterId,
        releaseId,
        factKey: fact.factKey,
        reason: 'relationship_disclosure_authority_unresolved',
      });
    case 'PUBLIC':
      break;
  }

  if (fact.value === undefined) {
    throw new CharacterPublicFactChatReadErrorV1(
      'Resolved public Character fact has no source value.',
    );
  }

  return Object.freeze({
    schemaVersion: 'v1',
    status: 'available',
    characterId,
    releaseId,
    factKey: fact.factKey,
    sourceAuthority: fact.sourceAuthority,
    value: fact.value,
    provenance: Object.freeze({
      sourceSection: fact.sourceSection,
      sourceBibleDocument: fact.sourceBibleDocument,
      sourceBibleRevision: fact.sourceBibleRevision,
    }),
  });
}
