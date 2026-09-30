import {
  projectCharacterRuntimeContextForRendererV1,
  type CharacterRendererRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import type {
  CharacterFactRegistryReadAuthorityPortV1,
} from './character-fact-registry-authority.js';
import {
  prepareCharacterStandardReadingPublicFactGenerationContextV1,
} from './character-standard-reading-public-fact-context.js';
import type {
  CharacterPublicFactChatReadV1,
} from './character-standard-reading-public-fact-read.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from './character-standard-reading-chat-turn-preflight.js';

export interface PrepareCharacterStandardReadingRendererContextInputV1 {
  readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  readonly publicFactKeys: readonly string[];
  readonly factAuthorityPort: CharacterFactRegistryReadAuthorityPortV1;
}

export interface CharacterStandardReadingRendererContextPlanV1 {
  readonly schemaVersion: 'v1';
  /**
   * Provider/model-facing projection only.
   * Server provenance and blocked fact decisions are deliberately absent.
   */
  readonly providerContext: CharacterRendererRuntimeContextV1;
  /**
   * Server-only orchestration record. Do not forward this collection to the provider.
   */
  readonly publicFactDecisions: readonly CharacterPublicFactChatReadV1[];
}

/**
 * Final server-only composition seam immediately before a Character provider call.
 *
 * Flow:
 * server-minted Chat turn preflight
 * -> release-pinned public fact authority
 * -> Runtime attachment of only admitted facts
 * -> renderer-safe projection that strips registry provenance
 *
 * Relationship-gated/private/unresolved facts remain represented only in the
 * server-side decisions collection and never enter providerContext.
 */
export async function prepareCharacterStandardReadingRendererContextV1(
  input: PrepareCharacterStandardReadingRendererContextInputV1,
): Promise<CharacterStandardReadingRendererContextPlanV1> {
  const preparedFacts =
    await prepareCharacterStandardReadingPublicFactGenerationContextV1({
      preflight: input.preflight,
      factKeys: input.publicFactKeys,
      authorityPort: input.factAuthorityPort,
    });

  const providerContext = projectCharacterRuntimeContextForRendererV1(
    preparedFacts.context,
  );

  return Object.freeze({
    schemaVersion: 'v1',
    providerContext,
    publicFactDecisions: preparedFacts.decisions,
  });
}
