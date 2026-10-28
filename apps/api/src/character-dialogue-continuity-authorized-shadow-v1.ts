import type { CharacterRuntimeContextV1 } from
  '../../../packages/domain/src/character-runtime-context.js';
import {
  composeCharacterDialogueContinuityPlanShadowV1,
  requireCharacterThreadSnapshotShadowV1,
  type CharacterDialogueMessageShadowV1,
  type CharacterDialogueContinuityPlanShadowV1,
} from '../../../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import {
  createPostgresCharacterThreadSnapshotShadowV1,
} from './postgres-character-thread-snapshot-shadow-v1.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';

export const CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_VERSION_V1 =
  'character-dialogue-authorized-shadow-v1' as const;

export class CharacterDialogueAuthorizedShadowHoldV1 extends Error {
  readonly code = 'CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_UNAVAILABLE' as const;
  constructor() {
    super('CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_UNAVAILABLE');
    this.name = 'CharacterDialogueAuthorizedShadowHoldV1';
  }
}

export interface CharacterDialogueAuthorizedShadowResultV1 {
  readonly version: typeof CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_VERSION_V1;
  readonly scope: 'RESEARCH_SHADOW_NOT_PRODUCTION';
  readonly characterId: string;
  readonly sourceContentBundleId: string;
  readonly sourceContentVersion: string;
  readonly dialoguePlan: CharacterDialogueContinuityPlanShadowV1;
  readonly mayInvokeProvider: false;
  readonly mayReveal: false;
  readonly revalidationRequiredBeforeModelOrReveal: true;
}

/**
 * Existing C1 runtime + subject-bound DB-read integration, not a separate
 * character engine. Run only INSIDE executePostgresSubjectTransactionV1 and
 * never accept the user/client's identity or transcript as the authority.
 *
 * This returns a verified, read-only shadow plan. It cannot call a model,
 * commit memory/relationship events, or reveal text; a later guarded runner
 * must recheck source closure before generating/publishing.
 */
export async function prepareCharacterDialogueAuthorizedShadowV1(input: Readonly<{
  runtime: CharacterRuntimeContextV1;
  recentConversation: readonly CharacterDialogueMessageShadowV1[];
  threadId: string;
  scope: PostgresSubjectExecutionScopeV1;
}>): Promise<CharacterDialogueAuthorizedShadowResultV1> {
  const hold = (): never => { throw new CharacterDialogueAuthorizedShadowHoldV1(); };
  const runtime = input.runtime;
  if (!runtime || runtime.schemaVersion !== 'v1' ||
      !runtime.characterId || !runtime.contentBundleId ||
      !runtime.contentVersion ||
      !Array.isArray(runtime.memories) || runtime.memories.length !== 0 ||
      !Array.isArray(runtime.lifeFacts) || runtime.lifeFacts.length !== 0 ||
      runtime.saju !== null ||
      !Array.isArray(runtime.recentMessages) ||
      runtime.recentMessages.length !== input.recentConversation.length ||
      !runtime.recentMessages.every((text, index) =>
        text === input.recentConversation[index]?.text)) hold();
  try {
    const dialoguePlan = composeCharacterDialogueContinuityPlanShadowV1({
      voice: {
        characterId: runtime.characterId,
        speech: runtime.speech,
        persona: runtime.persona,
        behavior: runtime.behavior,
      },
      recentConversation: input.recentConversation,
    });
    const port = createPostgresCharacterThreadSnapshotShadowV1({
      scope: input.scope,
      threadId: input.threadId,
      characterId: runtime.characterId,
      recentConversation: input.recentConversation,
    });
    await requireCharacterThreadSnapshotShadowV1({
      packet: dialoguePlan.packet,
      port,
    });
    return Object.freeze({
      version: CHARACTER_DIALOGUE_AUTHORIZED_SHADOW_VERSION_V1,
      scope: 'RESEARCH_SHADOW_NOT_PRODUCTION' as const,
      characterId: runtime.characterId,
      sourceContentBundleId: runtime.contentBundleId,
      sourceContentVersion: runtime.contentVersion,
      dialoguePlan,
      mayInvokeProvider: false as const,
      mayReveal: false as const,
      revalidationRequiredBeforeModelOrReveal: true as const,
    });
  } catch {
    return hold();
  }
}
