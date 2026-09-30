import type {
  CharacterPublicFactContextV1,
  CharacterRuntimeContextV1,
} from './character-runtime-context.js';

export interface CharacterRendererPublicFactV1 {
  readonly factKey: string;
  readonly sourceAuthority: CharacterPublicFactContextV1['sourceAuthority'];
  readonly value: unknown;
}

export interface CharacterRendererSajuContextV1 {
  readonly domain: NonNullable<CharacterRuntimeContextV1['saju']>['domain'];
  readonly coverageState: NonNullable<CharacterRuntimeContextV1['saju']>['coverageState'];
  readonly hasProtectedSegments: boolean;
  readonly hasDisclosures: boolean;
  readonly hasAmbiguity: boolean;
  readonly capability: NonNullable<CharacterRuntimeContextV1['saju']>['capability'];
}

export type CharacterRendererRuntimeContextV1 = Omit<
  CharacterRuntimeContextV1,
  'publicCharacterFacts' | 'saju'
> & {
  readonly publicCharacterFacts: readonly CharacterRendererPublicFactV1[];
  readonly saju: CharacterRendererSajuContextV1 | null;
};

/**
 * Provider-facing projection.
 *
 * Server provenance required for admission remains in CharacterRuntimeContextV1
 * and is deliberately removed before model/provider invocation. The renderer
 * receives only the already-admitted public fact key, exact value and whether
 * the source is CANON or SOFT_CANON.
 *
 * For Saju-bearing turns, exact protected text/source refs/hashes and the Reading
 * identity remain server-only. The provider receives only the bounded state
 * needed to choose content-pinned safe-framing keys.
 */
export function projectCharacterRuntimeContextForRendererV1(
  context: CharacterRuntimeContextV1,
): CharacterRendererRuntimeContextV1 {
  const saju =
    context.saju === null
      ? null
      : Object.freeze({
          domain: context.saju.domain,
          coverageState: context.saju.coverageState,
          hasProtectedSegments: context.saju.protectedSegments.length > 0,
          hasDisclosures: context.saju.disclosures.length > 0,
          hasAmbiguity: context.saju.ambiguity.length > 0,
          capability: context.saju.capability,
        });

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
    saju,
  });
}
