import type {
  CharacterRuntimeContextAssemblyInputV1,
} from './character-chat-orchestration.js';
import {
  assembleCharacterRuntimeContextFromServerAuthorizedSajuV1,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/character-runtime-context.js';
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

const preparedOfficialReadingChatPlansV1 = new WeakSet<object>();

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
    ...(input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId }),
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

  const plan = Object.freeze({
    source,
    contextInput: Object.freeze({
      ...input.contextInput,
      saju,
    }),
  });

  preparedOfficialReadingChatPlansV1.add(plan);
  return plan;
}

/**
 * Production-safe assembly seam for a plan minted by the server-only Official
 * Reading authority composer above. Structural lookalikes are rejected.
 *
 * This does not expose a public Chat send route; it only proves that Production
 * runtime assembly can consume the exact server-retrieved protected Reading
 * without weakening the direct Saju injection guard.
 */
export function assemblePreparedCharacterStandardReadingRuntimeContextV1(
  plan: CharacterStandardReadingChatContextPlanV1,
): CharacterRuntimeContextV1 {
  if (!preparedOfficialReadingChatPlansV1.has(plan)) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading runtime context plan was not minted by server authority.',
    );
  }

  const saju = plan.contextInput.saju;
  if (
    saju === undefined ||
    saju.readingRef !== plan.source.readingId ||
    saju.domain !== plan.source.sajuDomain ||
    plan.contextInput.character.characterId !== plan.source.readerCharacterId
  ) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading runtime context plan provenance is inconsistent.',
    );
  }

  return assembleCharacterRuntimeContextFromServerAuthorizedSajuV1(
    plan.contextInput,
  );
}
