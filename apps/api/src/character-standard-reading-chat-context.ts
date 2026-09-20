import type {
  CharacterRuntimeContextAssemblyInputV1,
} from './character-chat-orchestration.js';
import {
  resolveCharacterStandardReadingKnowledgeV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingArtifactAuthorityPortV1,
  type CharacterStandardReadingKnowledgeSourceV1,
} from './character-standard-reading-knowledge.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';

export type CharacterStandardReadingChatBaseContextInputV1 = Omit<
  CharacterRuntimeContextAssemblyInputV1,
  'saju'
>;

export interface PrepareCharacterStandardReadingChatContextInputV1 {
  readonly resolvedSubjectId?: string;
  readonly readerCharacterId: unknown;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly contextInput: CharacterStandardReadingChatBaseContextInputV1;
}

export interface CharacterStandardReadingChatContextPlanV1 {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly contextInput: CharacterRuntimeContextAssemblyInputV1;
}

export class CharacterStandardReadingChatContextErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingChatContextErrorV1';
  }
}

function assertNoCallerSajuContext(
  input: CharacterStandardReadingChatBaseContextInputV1,
): void {
  if (Object.prototype.hasOwnProperty.call(input, 'saju')) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading Chat context does not accept caller-supplied Saju context.',
    );
  }
}

/**
 * Server-only composition boundary for Reader follow-up Chat.
 *
 * The caller supplies current server-resolved Subject / Reader / Reading identities
 * plus non-Saju Character context. Reader access and the raw Official Reading are
 * independently re-resolved from server authority, then the exact Official Reading
 * is projected through the protected Character Saju seam.
 *
 * This function deliberately returns a context-assembly input rather than bypassing
 * the existing Production Saju execution gate. Public Chat activation remains a
 * separate authority decision.
 */
export async function prepareCharacterStandardReadingChatContextV1(
  input: PrepareCharacterStandardReadingChatContextInputV1,
): Promise<CharacterStandardReadingChatContextPlanV1> {
  assertNoCallerSajuContext(input.contextInput);

  const source = await resolveCharacterStandardReadingKnowledgeV1({
    resolvedSubjectId: input.resolvedSubjectId,
    readerCharacterId: input.readerCharacterId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
  });

  if (input.contextInput.character.characterId !== source.readerCharacterId) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading Reader does not match the active Character context.',
    );
  }

  if (
    !input.contextInput.character.capabilities.some(
      (capability) => capability.domain === source.sajuDomain,
    )
  ) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Active Character content does not authorize the Official Reading domain.',
    );
  }

  const saju =
    projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source);

  return Object.freeze({
    source,
    contextInput: Object.freeze({
      ...input.contextInput,
      saju,
    }),
  });
}
