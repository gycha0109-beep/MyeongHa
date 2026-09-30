import {
  compileCharacterFactRegistryFromBibleV1,
  type CharacterFactRegistryPublicationRowV1,
} from './fact-registry-compiler-v1.js';

export const CHARACTER_FACT_REGISTRY_BIBLE_SOURCES_V1 = Object.freeze([
  Object.freeze({
    characterId: 'seyeon',
    sourceBiblePath: 'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    sourceBibleRevision: 'v0.2',
  }),
  Object.freeze({
    characterId: 'yeoul',
    sourceBiblePath: 'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
    sourceBibleDocument: 'YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
    sourceBibleRevision: 'v0.3',
  }),
  Object.freeze({
    characterId: 'rahyeon',
    sourceBiblePath: 'docs/character/RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md',
    sourceBibleDocument: 'RAHYEON_CHARACTER_BIBLE_DRAFT_V0_5.md',
    sourceBibleRevision: 'v0.5',
  }),
] as const);

export type CharacterFactRegistryBibleSourceV1 =
  (typeof CHARACTER_FACT_REGISTRY_BIBLE_SOURCES_V1)[number];

export interface CharacterFactRegistryBibleSourceReaderV1 {
  readText(sourceBiblePath: string): string;
}

export interface CompiledCharacterFactRegistrySourceV1 {
  readonly source: CharacterFactRegistryBibleSourceV1;
  readonly rows: readonly CharacterFactRegistryPublicationRowV1[];
}

/**
 * Compiles only explicitly registered reviewed Character Bible sources.
 *
 * Adding a Character to Runtime fact publication requires adding an explicit
 * versioned Bible source here. The compiler still reads only the Fact Authority
 * appendix and never infers missing facts from prose or neighboring Characters.
 */
export function compileRegisteredCharacterFactRegistrySourcesV1(input: {
  readonly sourceReader: CharacterFactRegistryBibleSourceReaderV1;
}): readonly CompiledCharacterFactRegistrySourceV1[] {
  const seenCharacterIds = new Set<string>();
  const seenDocuments = new Set<string>();

  return Object.freeze(
    CHARACTER_FACT_REGISTRY_BIBLE_SOURCES_V1.map((source) => {
      if (seenCharacterIds.has(source.characterId)) {
        throw new TypeError(
          `Duplicate Character fact registry source characterId: ${source.characterId}`,
        );
      }
      if (seenDocuments.has(source.sourceBibleDocument)) {
        throw new TypeError(
          `Duplicate Character fact registry source document: ${source.sourceBibleDocument}`,
        );
      }
      seenCharacterIds.add(source.characterId);
      seenDocuments.add(source.sourceBibleDocument);

      const bibleMarkdown = input.sourceReader.readText(source.sourceBiblePath);
      if (typeof bibleMarkdown !== 'string' || bibleMarkdown.trim().length === 0) {
        throw new TypeError(
          `Character fact registry Bible source is empty: ${source.sourceBiblePath}`,
        );
      }

      const rows = compileCharacterFactRegistryFromBibleV1({
        characterId: source.characterId,
        sourceBibleDocument: source.sourceBibleDocument,
        sourceBibleRevision: source.sourceBibleRevision,
        bibleMarkdown,
      });

      return Object.freeze({
        source,
        rows,
      });
    }),
  );
}

export function flattenCompiledCharacterFactRegistrySourcesV1(
  compiled: readonly CompiledCharacterFactRegistrySourceV1[],
): readonly CharacterFactRegistryPublicationRowV1[] {
  const seen = new Set<string>();
  const rows: CharacterFactRegistryPublicationRowV1[] = [];

  for (const entry of compiled) {
    for (const row of entry.rows) {
      const identity = `${row.characterId}:${row.factKey}`;
      if (seen.has(identity)) {
        throw new TypeError(
          `Duplicate compiled Character fact registry identity: ${identity}`,
        );
      }
      seen.add(identity);
      rows.push(row);
    }
  }

  return Object.freeze(rows);
}
