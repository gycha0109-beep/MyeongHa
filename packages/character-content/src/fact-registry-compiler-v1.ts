export const CHARACTER_FACT_SOURCE_AUTHORITIES_V1 = [
  'CANON',
  'SOFT_CANON',
  'AUTHOR_UNDEFINED',
  'INTENTIONALLY_OPEN',
  'WORLD_DEPENDENT',
] as const;

export type CharacterFactSourceAuthorityV1 =
  (typeof CHARACTER_FACT_SOURCE_AUTHORITIES_V1)[number];

export const CHARACTER_FACT_KNOWLEDGE_STATES_V1 = [
  'KNOWN',
  'PARTIAL',
  'UNKNOWN_TO_CHARACTER',
  'NOT_APPLICABLE',
] as const;

export type CharacterFactKnowledgeStateV1 =
  (typeof CHARACTER_FACT_KNOWLEDGE_STATES_V1)[number];

export const CHARACTER_FACT_DISCLOSURE_DEFAULTS_V1 = [
  'PUBLIC',
  'FAMILIAR',
  'ATTACHED',
  'DEEP_TRUST',
  'CONTEXTUAL',
  'NEVER',
  'NOT_APPLICABLE',
] as const;

export type CharacterFactDisclosureDefaultV1 =
  (typeof CHARACTER_FACT_DISCLOSURE_DEFAULTS_V1)[number];

export interface CharacterFactRegistryPublicationRowV1 {
  readonly characterId: string;
  readonly factKey: string;
  readonly sourceAuthority: CharacterFactSourceAuthorityV1;
  readonly characterKnowledge: CharacterFactKnowledgeStateV1;
  readonly disclosureDefault: CharacterFactDisclosureDefaultV1;
  readonly sourceSection: string;
  readonly sourceBibleDocument: string;
  readonly sourceBibleRevision: string;
  readonly value?: string;
  readonly closureNote?: string;
}

export class CharacterFactRegistryCompilerErrorV1 extends Error {
  override readonly name = 'CharacterFactRegistryCompilerErrorV1';

  constructor(message: string) {
    super(message);
  }
}

const APPENDIX_HEADING = '# FACT AUTHORITY & BIOGRAPHY CLOSURE APPENDIX';
const EXPECTED_HEADER = [
  'fact_key',
  'value / policy',
  'source authority',
  'Character knowledge',
  'disclosure default',
  'source',
  'closure note',
] as const;

function requiredText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CharacterFactRegistryCompilerErrorV1(`${path} is required.`);
  }
  return normalized;
}

function stripCode(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Fact authority appendix row must be a Markdown table row.',
    );
  }
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function isDividerRow(cells: readonly string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  path: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CharacterFactRegistryCompilerErrorV1(
      `${path} contains unsupported value: ${value}`,
    );
  }
  return value as T;
}

function resolvedAuthority(sourceAuthority: CharacterFactSourceAuthorityV1): boolean {
  return sourceAuthority === 'CANON' || sourceAuthority === 'SOFT_CANON';
}

/**
 * Deterministically compiles only the explicit Fact Authority appendix.
 *
 * It does not infer facts from prose, fix missing authoring, or interpret
 * Principle/Calling. Resolved values are preserved as the appendix's exact
 * value/policy cell text. Unresolved authority rows carry no value.
 */
export function compileCharacterFactRegistryFromBibleV1(input: {
  readonly characterId: string;
  readonly sourceBibleDocument: string;
  readonly sourceBibleRevision: string;
  readonly bibleMarkdown: string;
}): readonly CharacterFactRegistryPublicationRowV1[] {
  const characterId = requiredText(input.characterId, 'characterId');
  const sourceBibleDocument = requiredText(
    input.sourceBibleDocument,
    'sourceBibleDocument',
  );
  const sourceBibleRevision = requiredText(
    input.sourceBibleRevision,
    'sourceBibleRevision',
  );

  const lines = input.bibleMarkdown.split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => line.trim() === APPENDIX_HEADING);
  if (headingIndex < 0) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Character Bible has no Fact Authority appendix.',
    );
  }

  let tableStart = headingIndex + 1;
  while (tableStart < lines.length && !lines[tableStart]!.trim().startsWith('|')) {
    tableStart += 1;
  }
  if (tableStart >= lines.length) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Character Bible Fact Authority appendix has no table.',
    );
  }

  const header = splitMarkdownRow(lines[tableStart]!);
  if (
    header.length !== EXPECTED_HEADER.length ||
    header.some((cell, index) => cell !== EXPECTED_HEADER[index])
  ) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Character Bible Fact Authority appendix header is unsupported.',
    );
  }

  const dividerLine = lines[tableStart + 1];
  if (dividerLine === undefined) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Character Bible Fact Authority appendix divider is missing.',
    );
  }
  const divider = splitMarkdownRow(dividerLine);
  if (divider.length !== EXPECTED_HEADER.length || !isDividerRow(divider)) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Character Bible Fact Authority appendix divider is invalid.',
    );
  }

  const rows: CharacterFactRegistryPublicationRowV1[] = [];
  const seenFactKeys = new Set<string>();

  for (let index = tableStart + 2; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0 || line.startsWith('#')) break;
    if (!line.startsWith('|')) break;

    const cells = splitMarkdownRow(line);
    if (cells.length !== EXPECTED_HEADER.length) {
      throw new CharacterFactRegistryCompilerErrorV1(
        `Fact authority row ${index + 1} has an unsupported column count.`,
      );
    }

    const factKey = requiredText(stripCode(cells[0]!), `row ${index + 1} fact_key`);
    if (seenFactKeys.has(factKey)) {
      throw new CharacterFactRegistryCompilerErrorV1(
        `Duplicate Character fact key: ${factKey}`,
      );
    }
    seenFactKeys.add(factKey);

    const valueOrPolicy = requiredText(cells[1]!, `row ${index + 1} value / policy`);
    const sourceAuthority = oneOf(
      stripCode(cells[2]!),
      CHARACTER_FACT_SOURCE_AUTHORITIES_V1,
      `row ${index + 1} source authority`,
    );
    const characterKnowledge = oneOf(
      stripCode(cells[3]!),
      CHARACTER_FACT_KNOWLEDGE_STATES_V1,
      `row ${index + 1} Character knowledge`,
    );
    const disclosureDefault = oneOf(
      stripCode(cells[4]!),
      CHARACTER_FACT_DISCLOSURE_DEFAULTS_V1,
      `row ${index + 1} disclosure default`,
    );
    const sourceSection = requiredText(cells[5]!, `row ${index + 1} source`);
    const closureNote = cells[6]!.trim();

    rows.push(Object.freeze({
      characterId,
      factKey,
      sourceAuthority,
      characterKnowledge,
      disclosureDefault,
      sourceSection,
      sourceBibleDocument,
      sourceBibleRevision,
      ...(resolvedAuthority(sourceAuthority)
        ? { value: valueOrPolicy }
        : {}),
      ...(closureNote.length === 0 ? {} : { closureNote }),
    }));
  }

  if (rows.length === 0) {
    throw new CharacterFactRegistryCompilerErrorV1(
      'Character Bible Fact Authority appendix contains no facts.',
    );
  }

  return Object.freeze(rows);
}
