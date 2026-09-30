import type { CharacterRuntimeContextV1 } from '../../../packages/domain/src/index.js';
import {
  attachServerAuthorizedCharacterPublicFactsV1,
} from '../../../packages/domain/src/character-runtime-context.js';
import type {
  CharacterFactRegistryReadAuthorityPortV1,
} from './character-fact-registry-authority.js';
import {
  readCharacterPublicFactForStandardReadingChatV1,
  type CharacterPublicFactChatReadV1,
} from './character-standard-reading-public-fact-read.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from './character-standard-reading-chat-turn-preflight.js';

export interface PrepareCharacterStandardReadingPublicFactGenerationContextInputV1 {
  readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  readonly factKeys: readonly string[];
  readonly authorityPort: CharacterFactRegistryReadAuthorityPortV1;
}

export interface CharacterStandardReadingPublicFactGenerationContextV1 {
  readonly schemaVersion: 'v1';
  readonly context: CharacterRuntimeContextV1;
  readonly decisions: readonly CharacterPublicFactChatReadV1[];
}

export class CharacterStandardReadingPublicFactGenerationContextErrorV1 extends Error {
  override readonly name =
    'CharacterStandardReadingPublicFactGenerationContextErrorV1';

  constructor(message: string) {
    super(message);
  }
}

function normalizeFactKeys(factKeys: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const [index, value] of factKeys.entries()) {
    const factKey = value.trim();
    if (factKey.length === 0 || factKey.length > 160) {
      throw new CharacterStandardReadingPublicFactGenerationContextErrorV1(
        `factKeys[${index}] is outside the supported bounds.`,
      );
    }
    if (seen.has(factKey)) {
      throw new CharacterStandardReadingPublicFactGenerationContextErrorV1(
        `Duplicate Character fact selector: ${factKey}`,
      );
    }
    seen.add(factKey);
    normalized.push(factKey);
  }

  return Object.freeze(normalized);
}

/**
 * Server-only Character fact context composition.
 *
 * Blocked fact decisions are returned for orchestration/observability, but only
 * exact PUBLIC + KNOWN + resolved facts admitted by the upstream read seam are
 * attached to the renderer context.
 */
export async function prepareCharacterStandardReadingPublicFactGenerationContextV1(
  input: PrepareCharacterStandardReadingPublicFactGenerationContextInputV1,
): Promise<CharacterStandardReadingPublicFactGenerationContextV1> {
  const factKeys = normalizeFactKeys(input.factKeys);
  const decisions: CharacterPublicFactChatReadV1[] = [];
  const attachments: Parameters<
    typeof attachServerAuthorizedCharacterPublicFactsV1
  >[1][number][] = [];

  for (const factKey of factKeys) {
    const decision = await readCharacterPublicFactForStandardReadingChatV1({
      preflight: input.preflight,
      factKey,
      authorityPort: input.authorityPort,
    });
    decisions.push(decision);

    if (decision.status !== 'available') continue;

    attachments.push(Object.freeze({
      characterId: decision.characterId,
      factKey: decision.factKey,
      sourceAuthority: decision.sourceAuthority,
      value: decision.value,
      sourceReleaseId: decision.releaseId,
      sourceSection: decision.provenance.sourceSection,
      sourceBibleDocument: decision.provenance.sourceBibleDocument,
      sourceBibleRevision: decision.provenance.sourceBibleRevision,
    }));
  }

  const context = attachServerAuthorizedCharacterPublicFactsV1(
    input.preflight.runtime.context,
    attachments,
  );

  return Object.freeze({
    schemaVersion: 'v1',
    context,
    decisions: Object.freeze(decisions),
  });
}
