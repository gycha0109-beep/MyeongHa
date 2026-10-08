import type { RunSeyeonCharacterTurnV2Input, SeyeonStructuredProviderPortV2 } from './seyeon-character-runtime-v2.js';
import { createSeyeonUnifiedPreflightShadowV1 } from './seyeon-unified-preflight-shadow-v1.js';

export const SEYEON_UNIFIED_GOVERNANCE_CANDIDATE_VERSION_V1 =
  'seyeon-unified-governance-candidate-v1' as const;

/**
 * Per-turn opt-in adapter. The underlying production authority resolvers,
 * disclosure source policy and retrieval guards are reused unchanged.
 * NOT installed by the production chat/turn-send runtime.
 */
export function createSeyeonUnifiedGovernanceCandidateV1(input: {
  readonly governance: RunSeyeonCharacterTurnV2Input['governance'];
  readonly provider: SeyeonStructuredProviderPortV2;
}): RunSeyeonCharacterTurnV2Input['governance'] {
  const classifier = createSeyeonUnifiedPreflightShadowV1(input.provider);
  let boundText: string | null = null;
  let classification: ReturnType<typeof classifier.classify> | null = null;

  function classifyOnce(characterId: string, rawText: string) {
    if (characterId !== 'seyeon' || typeof rawText !== 'string' ||
        rawText.trim().length === 0 || rawText.length > 4000) {
      throw new TypeError('Unified candidate requires one bounded Se-yeon user turn.');
    }
    // No normalization/coalescing of different turns or different user text.
    if (boundText !== null && boundText !== rawText) {
      throw new TypeError('Unified candidate cannot classify two different user messages.');
    }
    if (classification === null) {
      boundText = rawText;
      classification = classifier.classify({ characterId, userText: rawText });
    }
    return classification;
  }

  return Object.freeze({
    ...input.governance,
    integrity: Object.freeze({
      ...input.governance.integrity,
      classifier: Object.freeze({
        async classify({ characterId, userText }: { characterId: string; userText: string }) {
          return (await classifyOnce(characterId, userText)).integrity;
        },
      }),
    }),
    disclosure: Object.freeze({
      ...input.governance.disclosure,
      classifier: Object.freeze({
        async classify({ characterId, userQuestion }: { characterId: 'seyeon'; userQuestion: string }) {
          return (await classifyOnce(characterId, userQuestion)).disclosure;
        },
      }),
    }),
  });
}
