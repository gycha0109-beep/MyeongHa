import {
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
  type CharacterImmutableAuthoringV1CharacterId,
} from './immutable-authoring-v1.js';
import type {
  CharacterCanonCompletionV1,
  CharacterContentBundleCandidateMetadataV1,
  CharacterPrincipleCallingCompletionV1,
  CharacterPublicationMaterialInputV1,
} from './content-candidate-assembler-v1.js';

export type CharacterPublicationReadinessCharacterId =
  CharacterImmutableAuthoringV1CharacterId;

export type CharacterPublicationMetadataField =
  keyof CharacterContentBundleCandidateMetadataV1;

export type CharacterCanonReadinessField =
  | 'worldview.coreValues'
  | 'worldview.humanTheory'
  | 'worldview.agencyTheory'
  | 'worldview.truthTheory'
  | 'psychology.desire'
  | 'psychology.fear'
  | 'psychology.flaw'
  | 'psychology.contradiction'
  | 'psychology.hiddenMotivation';

export type CharacterPublicationMaterialField =
  | 'assetRefs'
  | 'emotionIds'
  | 'animationCueIds';

export type CharacterPrincipleCallingReadinessField =
  | 'representativeTitle'
  | 'callingBond.resolved';


export interface CharacterPublicationReadinessInputV1 {
  readonly metadata?: Partial<CharacterContentBundleCandidateMetadataV1>;
  readonly canonCompletions?: readonly CharacterCanonCompletionV1[];
  readonly principleCallingCompletions?: readonly CharacterPrincipleCallingCompletionV1[];
  readonly publicationMaterials?: readonly CharacterPublicationMaterialInputV1[];
}

export interface CharacterPublicationReadinessEntryV1 {
  readonly characterId: CharacterPublicationReadinessCharacterId;
  readonly missingCanonFields: readonly CharacterCanonReadinessField[];
  readonly missingPrincipleCallingFields: readonly CharacterPrincipleCallingReadinessField[];
  readonly missingPublicationMaterialFields: readonly CharacterPublicationMaterialField[];
}

export interface CharacterPublicationReadinessReportV1 {
  readonly ready: boolean;
  readonly missingMetadataFields: readonly CharacterPublicationMetadataField[];
  readonly duplicateCanonCharacterIds: readonly string[];
  readonly unexpectedCanonCharacterIds: readonly string[];
  readonly duplicatePrincipleCallingCharacterIds: readonly string[];
  readonly unexpectedPrincipleCallingCharacterIds: readonly string[];
  readonly duplicatePublicationMaterialCharacterIds: readonly string[];
  readonly unexpectedPublicationMaterialCharacterIds: readonly string[];
  readonly characters: readonly CharacterPublicationReadinessEntryV1[];
}

const METADATA_FIELDS: readonly CharacterPublicationMetadataField[] = [
  'bundleId',
  'contentVersion',
  'assetManifestHash',
  'cueSchemaVersion',
  'minClientCapability',
];

const ALL_CANON_FIELDS: readonly CharacterCanonReadinessField[] = [
  'worldview.coreValues',
  'worldview.humanTheory',
  'worldview.agencyTheory',
  'worldview.truthTheory',
  'psychology.desire',
  'psychology.fear',
  'psychology.flaw',
  'psychology.contradiction',
  'psychology.hiddenMotivation',
];

const ALL_PRINCIPLE_CALLING_FIELDS: readonly CharacterPrincipleCallingReadinessField[] = [
  'representativeTitle',
  'callingBond.resolved',
];

const ALL_PUBLICATION_MATERIAL_FIELDS: readonly CharacterPublicationMaterialField[] = [
  'assetRefs',
  'emotionIds',
  'animationCueIds',
];

const CANONICAL_CHARACTER_ID_SET = new Set<string>(
  CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS,
);

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasTextList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => hasText(entry))
  );
}

function rosterDiagnostics(
  entries: readonly { readonly characterId: string }[],
): { readonly duplicate: readonly string[]; readonly unexpected: readonly string[] } {
  const counts = new Map<string, number>();
  const unexpected = new Set<string>();

  for (const entry of entries) {
    counts.set(entry.characterId, (counts.get(entry.characterId) ?? 0) + 1);
    if (!CANONICAL_CHARACTER_ID_SET.has(entry.characterId)) {
      unexpected.add(entry.characterId);
    }
  }

  const duplicate = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([characterId]) => characterId)
    .sort();

  return { duplicate, unexpected: [...unexpected].sort() };
}

function missingCanonFields(
  completion: CharacterCanonCompletionV1 | undefined,
): readonly CharacterCanonReadinessField[] {
  if (completion === undefined) return [...ALL_CANON_FIELDS];

  const missing: CharacterCanonReadinessField[] = [];
  if (!hasTextList(completion.worldview.coreValues)) {
    missing.push('worldview.coreValues');
  }
  if (!hasText(completion.worldview.humanTheory)) {
    missing.push('worldview.humanTheory');
  }
  if (!hasText(completion.worldview.agencyTheory)) {
    missing.push('worldview.agencyTheory');
  }
  if (!hasText(completion.worldview.truthTheory)) {
    missing.push('worldview.truthTheory');
  }
  if (!hasText(completion.psychology.desire)) {
    missing.push('psychology.desire');
  }
  if (!hasText(completion.psychology.fear)) {
    missing.push('psychology.fear');
  }
  if (!hasText(completion.psychology.flaw)) {
    missing.push('psychology.flaw');
  }
  if (!hasText(completion.psychology.contradiction)) {
    missing.push('psychology.contradiction');
  }
  if (!hasText(completion.psychology.hiddenMotivation)) {
    missing.push('psychology.hiddenMotivation');
  }
  return missing;
}

function missingPrincipleCallingFields(
  completion: CharacterPrincipleCallingCompletionV1 | undefined,
): readonly CharacterPrincipleCallingReadinessField[] {
  if (completion === undefined) return [...ALL_PRINCIPLE_CALLING_FIELDS];

  const missing: CharacterPrincipleCallingReadinessField[] = [];
  if (!hasText(completion.representativeTitle)) {
    missing.push('representativeTitle');
  }
  if (completion.callingBond.authorityState !== 'resolved') {
    missing.push('callingBond.resolved');
  }
  return missing;
}

function missingPublicationMaterialFields(
  material: CharacterPublicationMaterialInputV1 | undefined,
): readonly CharacterPublicationMaterialField[] {
  if (material === undefined) return [...ALL_PUBLICATION_MATERIAL_FIELDS];

  const missing: CharacterPublicationMaterialField[] = [];
  if (!hasTextList(material.assetRefs)) missing.push('assetRefs');
  if (!hasTextList(material.emotionIds)) missing.push('emotionIds');
  if (!hasTextList(material.animationCueIds)) missing.push('animationCueIds');
  return missing;
}

/**
 * Inspect publication readiness without inventing or normalizing missing authority.
 *
 * This is deliberately weaker than assembly/publication: it only reports blockers.
 * It never creates default metadata, canon psychology, renderer IDs, asset refs,
 * provenance, hashes, or Character rows.
 */
export function inspectCharacterPublicationReadinessV1(
  input: CharacterPublicationReadinessInputV1 = {},
): CharacterPublicationReadinessReportV1 {
  const metadata = input.metadata ?? {};
  const canonCompletions = input.canonCompletions ?? [];
  const principleCallingCompletions = input.principleCallingCompletions ?? [];
  const publicationMaterials = input.publicationMaterials ?? [];

  const missingMetadataFields = METADATA_FIELDS.filter(
    (field) => !hasText(metadata[field]),
  );
  const canonDiagnostics = rosterDiagnostics(canonCompletions);
  const principleCallingDiagnostics = rosterDiagnostics(principleCallingCompletions);
  const publicationDiagnostics = rosterDiagnostics(publicationMaterials);

  const characters = CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.map(
    (characterId) => {
      const canonEntries = canonCompletions.filter(
        (entry) => entry.characterId === characterId,
      );
      const principleCallingEntries = principleCallingCompletions.filter(
        (entry) => entry.characterId === characterId,
      );
      const materialEntries = publicationMaterials.filter(
        (entry) => entry.characterId === characterId,
      );

      return {
        characterId,
        missingCanonFields:
          canonEntries.length === 1
            ? missingCanonFields(canonEntries[0])
            : canonEntries.length === 0
              ? [...ALL_CANON_FIELDS]
              : [],
        missingPrincipleCallingFields:
          principleCallingEntries.length === 1
            ? missingPrincipleCallingFields(principleCallingEntries[0])
            : principleCallingEntries.length === 0
              ? [...ALL_PRINCIPLE_CALLING_FIELDS]
              : [],
        missingPublicationMaterialFields:
          materialEntries.length === 1
            ? missingPublicationMaterialFields(materialEntries[0])
            : materialEntries.length === 0
              ? [...ALL_PUBLICATION_MATERIAL_FIELDS]
              : [],
      } satisfies CharacterPublicationReadinessEntryV1;
    },
  );

  const ready =
    missingMetadataFields.length === 0 &&
    canonDiagnostics.duplicate.length === 0 &&
    canonDiagnostics.unexpected.length === 0 &&
    principleCallingDiagnostics.duplicate.length === 0 &&
    principleCallingDiagnostics.unexpected.length === 0 &&
    publicationDiagnostics.duplicate.length === 0 &&
    publicationDiagnostics.unexpected.length === 0 &&
    characters.every(
      (entry) =>
        entry.missingCanonFields.length === 0 &&
        entry.missingPrincipleCallingFields.length === 0 &&
        entry.missingPublicationMaterialFields.length === 0,
    ) &&
    canonCompletions.length === CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.length &&
    principleCallingCompletions.length === CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.length &&
    publicationMaterials.length === CHARACTER_IMMUTABLE_AUTHORING_V1_CHARACTER_IDS.length;

  return {
    ready,
    missingMetadataFields,
    duplicateCanonCharacterIds: canonDiagnostics.duplicate,
    unexpectedCanonCharacterIds: canonDiagnostics.unexpected,
    duplicatePrincipleCallingCharacterIds: principleCallingDiagnostics.duplicate,
    unexpectedPrincipleCallingCharacterIds: principleCallingDiagnostics.unexpected,
    duplicatePublicationMaterialCharacterIds: publicationDiagnostics.duplicate,
    unexpectedPublicationMaterialCharacterIds: publicationDiagnostics.unexpected,
    characters,
  };
}
