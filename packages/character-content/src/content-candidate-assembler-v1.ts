import {
  CHARACTER_IMMUTABLE_AUTHORING_V1,
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
  type CharacterImmutableAuthoringV1CharacterId,
} from './immutable-authoring-v1.js';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS,
} from './runtime-authoring-v1.js';
import type {
  CharacterCanonProfile,
  CharacterContentBundle,
  CharacterContentDefinition,
} from './schema.js';
import { validateCharacterContentBundle } from './validate.js';

export type CharacterContentCandidateV1CharacterId =
  CharacterImmutableAuthoringV1CharacterId;

export interface CharacterCanonCompletionV1 {
  readonly characterId: CharacterContentCandidateV1CharacterId;
  /**
   * Explicit caller-supplied completion only. The assembler does not derive
   * worldview or psychology from hooks, names, visuals, persona, or runtime text.
   */
  readonly worldview: CharacterCanonProfile['worldview'];
  readonly psychology: CharacterCanonProfile['psychology'];
}

export interface CharacterPublicationMaterialInputV1 {
  readonly characterId: CharacterContentCandidateV1CharacterId;
  readonly assetRefs: readonly string[];
  readonly emotionIds: readonly string[];
  readonly animationCueIds: readonly string[];
}

export interface CharacterContentBundleCandidateMetadataV1 {
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
  readonly minClientCapability: string;
}

export interface CharacterContentBundleCandidateInputV1 {
  readonly metadata: CharacterContentBundleCandidateMetadataV1;
  readonly canonCompletions: readonly CharacterCanonCompletionV1[];
  readonly publicationMaterials: readonly CharacterPublicationMaterialInputV1[];
}

export type CharacterContentCandidateAssemblyErrorCode =
  | 'SOURCE_ROSTER_MISMATCH'
  | 'SOURCE_DISPLAY_NAME_MISMATCH'
  | 'CANON_COMPLETION_ROSTER_MISMATCH'
  | 'PUBLICATION_MATERIAL_ROSTER_MISMATCH';

export class CharacterContentCandidateAssemblyError extends Error {
  constructor(
    readonly code: CharacterContentCandidateAssemblyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterContentCandidateAssemblyError';
  }
}

const CANONICAL_CHARACTER_IDS = [
  ...CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
] as const;

function exactRosterProblem(
  entries: readonly { readonly characterId: string }[],
): string | undefined {
  const expected = new Set<string>(CANONICAL_CHARACTER_IDS);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const unexpected = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.characterId)) duplicates.add(entry.characterId);
    seen.add(entry.characterId);
    if (!expected.has(entry.characterId)) unexpected.add(entry.characterId);
  }

  const missing = CANONICAL_CHARACTER_IDS.filter((characterId) => !seen.has(characterId));
  if (
    entries.length === CANONICAL_CHARACTER_IDS.length &&
    duplicates.size === 0 &&
    unexpected.size === 0 &&
    missing.length === 0
  ) {
    return undefined;
  }

  return [
    `expected=${CANONICAL_CHARACTER_IDS.join(',')}`,
    `missing=${missing.join(',') || 'none'}`,
    `unexpected=${[...unexpected].join(',') || 'none'}`,
    `duplicates=${[...duplicates].join(',') || 'none'}`,
  ].join('; ');
}

function assertExactRoster(
  entries: readonly { readonly characterId: string }[],
  code:
    | 'CANON_COMPLETION_ROSTER_MISMATCH'
    | 'PUBLICATION_MATERIAL_ROSTER_MISMATCH',
  label: string,
): void {
  const problem = exactRosterProblem(entries);
  if (problem !== undefined) {
    throw new CharacterContentCandidateAssemblyError(
      code,
      `${label} must contain exactly one entry for each approved Character; ${problem}`,
    );
  }
}

function assertSourceAlignment(): void {
  const immutableProblem = exactRosterProblem(CHARACTER_IMMUTABLE_AUTHORING_V1);
  const runtimeProblem = exactRosterProblem(CHARACTER_RUNTIME_AUTHORING_V1);
  const runtimeIdsMatch =
    CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS.length ===
      CANONICAL_CHARACTER_IDS.length &&
    CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS.every(
      (characterId, index) => characterId === CANONICAL_CHARACTER_IDS[index],
    );

  if (
    immutableProblem !== undefined ||
    runtimeProblem !== undefined ||
    !runtimeIdsMatch
  ) {
    throw new CharacterContentCandidateAssemblyError(
      'SOURCE_ROSTER_MISMATCH',
      `Immutable/runtime authoring sources no longer share the exact canonical roster; immutable=${immutableProblem ?? 'ok'}; runtime=${runtimeProblem ?? 'ok'}.`,
    );
  }

  for (const characterId of CANONICAL_CHARACTER_IDS) {
    const immutable = CHARACTER_IMMUTABLE_AUTHORING_V1.find(
      (entry) => entry.characterId === characterId,
    );
    const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (entry) => entry.characterId === characterId,
    );
    if (immutable === undefined || runtime === undefined) {
      throw new CharacterContentCandidateAssemblyError(
        'SOURCE_ROSTER_MISMATCH',
        `Missing source authoring for ${characterId}.`,
      );
    }
    if (immutable.displayName !== runtime.displayName) {
      throw new CharacterContentCandidateAssemblyError(
        'SOURCE_DISPLAY_NAME_MISMATCH',
        `Immutable/runtime displayName mismatch for ${characterId}: immutable=${immutable.displayName}; runtime=${runtime.displayName}.`,
      );
    }
  }
}

/**
 * Assemble a complete CharacterContentBundle candidate from already-authored
 * immutable/runtime source plus explicit unresolved inputs.
 *
 * This function is intentionally not a source-authority decision and does not
 * publish anything. In particular, it never derives missing canon psychology,
 * renderer IDs, asset refs, provenance, or bundle metadata. Callers must supply
 * those values explicitly from their own source-backed handoff, and the returned
 * candidate must still pass the separate Production publication boundary before
 * any release/catalog mutation is attempted.
 */
export function assembleCharacterContentBundleCandidateV1(
  input: CharacterContentBundleCandidateInputV1,
): CharacterContentBundle {
  assertSourceAlignment();
  assertExactRoster(
    input.canonCompletions,
    'CANON_COMPLETION_ROSTER_MISMATCH',
    'canonCompletions',
  );
  assertExactRoster(
    input.publicationMaterials,
    'PUBLICATION_MATERIAL_ROSTER_MISMATCH',
    'publicationMaterials',
  );

  const canonById = new Map(
    input.canonCompletions.map((entry) => [entry.characterId, entry] as const),
  );
  const materialById = new Map(
    input.publicationMaterials.map((entry) => [entry.characterId, entry] as const),
  );

  const characters = CANONICAL_CHARACTER_IDS.map((characterId) => {
    const immutable = CHARACTER_IMMUTABLE_AUTHORING_V1.find(
      (entry) => entry.characterId === characterId,
    );
    const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (entry) => entry.characterId === characterId,
    );
    const canonCompletion = canonById.get(characterId);
    const material = materialById.get(characterId);

    if (
      immutable === undefined ||
      runtime === undefined ||
      canonCompletion === undefined ||
      material === undefined
    ) {
      throw new CharacterContentCandidateAssemblyError(
        'SOURCE_ROSTER_MISMATCH',
        `Candidate input/source lookup failed for ${characterId}.`,
      );
    }

    return {
      characterId,
      contentVersion: input.metadata.contentVersion,
      displayName: immutable.displayName,
      gender: immutable.gender,
      deityProxyLabel: immutable.deityProxyLabel,
      shortDescriptor: immutable.shortDescriptor,
      personalityTraits: immutable.personalityTraits,
      flaws: immutable.flaws,
      values: immutable.values,
      speech: runtime.speech,
      capabilities: runtime.capabilities,
      assetRefs: material.assetRefs,
      emotionIds: material.emotionIds,
      animationCueIds: material.animationCueIds,
      canon: {
        worldRole: immutable.worldRole,
        origin: immutable.origin,
        apparentAgeBand: immutable.apparentAgeBand,
        deityBond: {
          deityId: immutable.deityId,
          representationRole: immutable.deityBond.representationRole,
          oath: immutable.deityBond.oath,
          acceptedDoctrine: immutable.deityBond.acceptedDoctrine,
          resistedDoctrine: immutable.deityBond.resistedDoctrine,
        },
        worldview: canonCompletion.worldview,
        psychology: canonCompletion.psychology,
      },
      visual: immutable.visual,
      persona: runtime.persona,
      behavior: runtime.behavior,
      sajuProfile: runtime.sajuProfile,
      relationshipBehavior: runtime.relationshipBehavior,
    } satisfies CharacterContentDefinition;
  });

  const bundle = {
    bundleId: input.metadata.bundleId,
    contentVersion: input.metadata.contentVersion,
    assetManifestHash: input.metadata.assetManifestHash,
    cueSchemaVersion: input.metadata.cueSchemaVersion,
    minClientCapability: input.metadata.minClientCapability,
    characters,
  } satisfies CharacterContentBundle;

  return validateCharacterContentBundle(bundle);
}
