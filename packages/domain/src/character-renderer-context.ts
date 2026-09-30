import type {
  CharacterPublicFactContextV1,
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';

export interface CharacterRendererPublicFactV1 {
  readonly factKey: string;
  readonly sourceAuthority: CharacterPublicFactContextV1['sourceAuthority'];
  readonly value: unknown;
}

export type CharacterRendererRuntimeContextV1 = Omit<
  CharacterRuntimeContextV1,
  'publicCharacterFacts'
> & {
  readonly publicCharacterFacts: readonly CharacterRendererPublicFactV1[];
};

/**
 * Provider-facing projection.
 *
 * Server provenance required for admission remains in CharacterRuntimeContextV1
 * and is deliberately removed before model/provider invocation. The renderer
 * receives only the already-admitted public fact key, exact value and whether
 * the source is CANON or SOFT_CANON.
 */
export function projectCharacterRuntimeContextForRendererV1(
  context: CharacterRuntimeContextV1,
): CharacterRendererRuntimeContextV1 {
  return Object.freeze({
    ...context,
    publicCharacterFacts: Object.freeze(
      context.publicCharacterFacts.map((fact) =>
        Object.freeze({
          factKey: fact.factKey,
          sourceAuthority: fact.sourceAuthority,
          value: fact.value,
        }),
      ),
    ),
  });
}
