import type { CharacterRuntimeContextV1 } from '../../../packages/domain/src/character-runtime-context.js';
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
  type ChatThreadRuntimeBindingV1,
} from './chat-thread-runtime-binding-read.js';
import {
  assemblePreparedCharacterStandardReadingRuntimeContextV1,
  prepareCharacterStandardReadingChatContextV1,
  type CharacterStandardReadingChatBaseContextInputV1,
} from './character-standard-reading-chat-context.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
  CharacterStandardReadingKnowledgeSourceV1,
} from './character-standard-reading-knowledge.js';

export interface PrepareCharacterStandardReadingThreadRuntimeInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly threadBindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly contextInput: CharacterStandardReadingChatBaseContextInputV1;
}

export interface CharacterStandardReadingThreadRuntimeV1 {
  readonly threadBinding: ChatThreadRuntimeBindingV1;
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly context: CharacterRuntimeContextV1;
}

export class CharacterStandardReadingThreadRuntimeErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingThreadRuntimeErrorV1';
  }
}

/**
 * Server-only thread-bound Official Reading runtime composition.
 *
 * Reader identity comes from the owner-authorized active single-Character thread,
 * not from URL/sessionStorage/client prose. The requested Reading identity remains
 * a selector only; Reader access and the raw artifact are independently re-read
 * by the downstream Official Reading authority boundary.
 */
export async function prepareCharacterStandardReadingThreadRuntimeV1(
  input: PrepareCharacterStandardReadingThreadRuntimeInputV1,
): Promise<CharacterStandardReadingThreadRuntimeV1> {
  const subjectBinding =
    input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId };

  const threadBinding = await getChatThreadRuntimeBinding({
    ...subjectBinding,
    threadId: input.threadId,
    authorityPort: input.threadBindingAuthorityPort,
  });

  if (threadBinding.participantCharacterIds.length !== 1) {
    throw new CharacterStandardReadingThreadRuntimeErrorV1(
      'Official Reading Reader follow-up requires an active single-Character thread.',
    );
  }

  const readerCharacterId = threadBinding.participantCharacterIds[0];
  if (readerCharacterId === undefined) {
    throw new CharacterStandardReadingThreadRuntimeErrorV1(
      'Official Reading Reader follow-up thread has no active Reader.',
    );
  }

  if (input.contextInput.character.characterId !== readerCharacterId) {
    throw new CharacterStandardReadingThreadRuntimeErrorV1(
      'Server Character context does not match the active thread Reader.',
    );
  }
  if (input.contextInput.contentBundleId !== threadBinding.activeContentBundleId) {
    throw new CharacterStandardReadingThreadRuntimeErrorV1(
      'Server Character context bundle does not match the active thread bundle.',
    );
  }

  const plan = await prepareCharacterStandardReadingChatContextV1({
    ...subjectBinding,
    readerCharacterId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
    contextInput: input.contextInput,
  });

  const context = assemblePreparedCharacterStandardReadingRuntimeContextV1(plan);

  return Object.freeze({
    threadBinding,
    source: plan.source,
    context,
  });
}
