import type { SeyeonBiblePrototypeContextV1 } from '../../character-content/src/seyeon-bible-prototype-v1.js';
import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';

export const CHARACTER_CONTEXT_COMPOSITION_PROTOTYPE_STATUS_V0_1 = {
  authority: 'research_experiment_only',
  productionRuntime: false,
  relationshipMutationAuthority: false,
  memoryMutationAuthority: false,
  sajuSemanticAuthority: false,
  providerSelection: false,
} as const;

export interface CharacterContextCompositionPrototypeV0_1 {
  readonly schemaVersion: 'character-context-composition-prototype-v0.1';
  readonly status: typeof CHARACTER_CONTEXT_COMPOSITION_PROTOTYPE_STATUS_V0_1;
  readonly characterAuthority: {
    readonly characterId: string;
    readonly contentBundleId: string;
    readonly contentVersion: string;
    readonly canon: CharacterRuntimeContextV1['canon'];
    readonly persona: CharacterRuntimeContextV1['persona'];
    readonly behavior: CharacterRuntimeContextV1['behavior'];
    readonly speech: CharacterRuntimeContextV1['speech'];
  };
  readonly selectedBibleTraits: SeyeonBiblePrototypeContextV1['selectedTraits'];
  readonly relationshipProjection: CharacterRuntimeContextV1['relationship'];
  readonly durableGrantedContext: {
    readonly lifeFacts: CharacterRuntimeContextV1['lifeFacts'];
    readonly memories: CharacterRuntimeContextV1['memories'];
  };
  readonly sessionContext: {
    readonly runtimeRecentMessages: CharacterRuntimeContextV1['recentMessages'];
    readonly roleAwareRecentDialogue: SeyeonBiblePrototypeContextV1['recentDialogue'];
  };
  readonly protectedSajuContext: CharacterRuntimeContextV1['saju'];
  readonly expressionRecency: {
    readonly recentlyExpressedSelectedTraitIds: readonly string[];
  };
  readonly compositionRules: readonly string[];
}

const COMPOSITION_RULES = Object.freeze([
  'Character canon/persona/behavior/speech come only from the pinned Character Runtime content bundle.',
  'Selected Character Bible traits are expression guidance only and cannot mutate canon, relationship state, durable memory, entitlement, or Saju truth.',
  'Recent dialogue/session messages provide short-term continuity only and cannot be promoted to durable memory without the separate Memory authority flow.',
  'Durable Life Facts and Character Memories enter only through already-granted Character Runtime context.',
  'Relationship projection is consumed as server-owned rendering input; this composer never derives scores, stages, deltas, or unlocks.',
  'Protected Saju context remains upstream-authoritative and cannot be paraphrased into new Saju claims by this composer.',
  'Expression recency is presentation metadata only and cannot become relationship truth or durable autobiographical memory.',
] as const);

function boundedUniqueTraitIds(
  traitIds: readonly string[] | undefined,
  selectedTraitIds: ReadonlySet<string>,
): readonly string[] {
  if (traitIds === undefined) return Object.freeze([]);

  const result: string[] = [];
  for (const rawId of traitIds.slice(-8)) {
    const traitId = rawId.trim();
    if (
      traitId.length === 0 ||
      !selectedTraitIds.has(traitId) ||
      result.includes(traitId)
    ) {
      continue;
    }
    result.push(traitId);
  }
  return Object.freeze(result);
}

export function composeSeyeonCharacterContextPrototypeV0_1(input: {
  readonly runtimeContext: CharacterRuntimeContextV1;
  readonly bibleContext: SeyeonBiblePrototypeContextV1;
  readonly recentlyExpressedTraitIds?: readonly string[];
}): CharacterContextCompositionPrototypeV0_1 {
  if (input.runtimeContext.characterId !== 'seyeon') {
    throw new TypeError('Seyeon context prototype requires runtimeContext.characterId=seyeon.');
  }
  if (input.bibleContext.status.productionRuntime) {
    throw new TypeError('Research Character Bible context cannot claim Production runtime authority.');
  }

  const selectedTraitIds = new Set(input.bibleContext.selectedTraits.map((trait) => trait.id));

  return Object.freeze({
    schemaVersion: 'character-context-composition-prototype-v0.1',
    status: CHARACTER_CONTEXT_COMPOSITION_PROTOTYPE_STATUS_V0_1,
    characterAuthority: Object.freeze({
      characterId: input.runtimeContext.characterId,
      contentBundleId: input.runtimeContext.contentBundleId,
      contentVersion: input.runtimeContext.contentVersion,
      canon: input.runtimeContext.canon,
      persona: input.runtimeContext.persona,
      behavior: input.runtimeContext.behavior,
      speech: input.runtimeContext.speech,
    }),
    selectedBibleTraits: Object.freeze([...input.bibleContext.selectedTraits]),
    relationshipProjection: input.runtimeContext.relationship,
    durableGrantedContext: Object.freeze({
      lifeFacts: input.runtimeContext.lifeFacts,
      memories: input.runtimeContext.memories,
    }),
    sessionContext: Object.freeze({
      runtimeRecentMessages: input.runtimeContext.recentMessages,
      roleAwareRecentDialogue: input.bibleContext.recentDialogue,
    }),
    protectedSajuContext: input.runtimeContext.saju,
    expressionRecency: Object.freeze({
      recentlyExpressedSelectedTraitIds: boundedUniqueTraitIds(
        input.recentlyExpressedTraitIds,
        selectedTraitIds,
      ),
    }),
    compositionRules: COMPOSITION_RULES,
  });
}
