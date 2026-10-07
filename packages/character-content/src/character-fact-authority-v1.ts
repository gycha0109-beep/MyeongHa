export const CHARACTER_SOURCE_AUTHORITY_STATES_V1 = Object.freeze([
  'CANON',
  'SOFT_CANON',
  'AUTHOR_UNDEFINED',
  'INTENTIONALLY_OPEN',
  'WORLD_DEPENDENT',
] as const);

export type CharacterSourceAuthorityStateV1 =
  (typeof CHARACTER_SOURCE_AUTHORITY_STATES_V1)[number];

export const CHARACTER_KNOWLEDGE_STATES_V1 = Object.freeze([
  'KNOWN',
  'PARTIAL',
  'UNKNOWN_TO_CHARACTER',
  'NOT_APPLICABLE',
] as const);

export type CharacterKnowledgeStateV1 =
  (typeof CHARACTER_KNOWLEDGE_STATES_V1)[number];

export const CHARACTER_DISCLOSURE_DEFAULTS_V1 = Object.freeze([
  'PUBLIC',
  'FAMILIAR',
  'ATTACHED',
  'DEEP_TRUST',
  'CONTEXTUAL',
  'NEVER',
  'NOT_APPLICABLE',
] as const);

export type CharacterDisclosureDefaultV1 =
  (typeof CHARACTER_DISCLOSURE_DEFAULTS_V1)[number];

export const CHARACTER_FACT_AUTHORITY_REGISTRY_SCHEMA_VERSION_V1 =
  'character-fact-authority-registry-v1' as const;

export interface CharacterFactAuthorityEntryV1 {
  readonly factKey: string;
  readonly sourceAuthority: CharacterSourceAuthorityStateV1;
  readonly characterKnowledge: CharacterKnowledgeStateV1;
  readonly disclosureDefault: CharacterDisclosureDefaultV1;
  readonly sourceSection: string | null;
  readonly closureNote: string;
}

export interface CharacterFactAuthorityRegistryV1 {
  readonly schemaVersion: typeof CHARACTER_FACT_AUTHORITY_REGISTRY_SCHEMA_VERSION_V1;
  readonly characterId: string;
  readonly sourceBible: Readonly<{
    readonly path: string;
    readonly gitBlobSha: string;
  }>;
  readonly entries: readonly CharacterFactAuthorityEntryV1[];
}

function requireText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new TypeError(`${path} must be a non-empty string within 512 characters.`);
  }
  return normalized;
}

function assertUniqueFactKeys(
  entries: readonly CharacterFactAuthorityEntryV1[],
): readonly CharacterFactAuthorityEntryV1[] {
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const factKey = requireText(entry.factKey, `entries[${index}].factKey`);
    if (seen.has(factKey)) {
      throw new TypeError(`Duplicate character fact authority key: ${factKey}`);
    }
    seen.add(factKey);
  }
  return entries;
}

export function isRuntimeAuthoritativeCharacterFactV1(
  entry: CharacterFactAuthorityEntryV1,
): boolean {
  return entry.sourceAuthority === 'CANON' || entry.sourceAuthority === 'SOFT_CANON';
}

export function isKnownToCharacterV1(
  entry: CharacterFactAuthorityEntryV1,
): boolean {
  return entry.characterKnowledge === 'KNOWN' || entry.characterKnowledge === 'PARTIAL';
}

export function resolveCharacterFactAuthorityEntryV1(
  registry: CharacterFactAuthorityRegistryV1,
  factKey: string,
): CharacterFactAuthorityEntryV1 | null {
  const normalizedFactKey = requireText(factKey, 'factKey');
  assertUniqueFactKeys(registry.entries);
  return registry.entries.find((entry) => entry.factKey === normalizedFactKey) ?? null;
}

export function validateCharacterFactAuthorityRegistryV1(
  registry: CharacterFactAuthorityRegistryV1,
): CharacterFactAuthorityRegistryV1 {
  if (
    registry.schemaVersion !== CHARACTER_FACT_AUTHORITY_REGISTRY_SCHEMA_VERSION_V1
  ) {
    throw new TypeError('Character fact authority registry schemaVersion is invalid.');
  }

  requireText(registry.characterId, 'characterId');
  requireText(registry.sourceBible.path, 'sourceBible.path');
  requireText(registry.sourceBible.gitBlobSha, 'sourceBible.gitBlobSha');

  if (registry.entries.length > 256) {
    throw new TypeError('Character fact authority registry exceeds 256 entries.');
  }

  assertUniqueFactKeys(registry.entries);

  for (const [index, entry] of registry.entries.entries()) {
    if (!CHARACTER_SOURCE_AUTHORITY_STATES_V1.includes(entry.sourceAuthority)) {
      throw new TypeError(`entries[${index}].sourceAuthority is invalid.`);
    }
    if (!CHARACTER_KNOWLEDGE_STATES_V1.includes(entry.characterKnowledge)) {
      throw new TypeError(`entries[${index}].characterKnowledge is invalid.`);
    }
    if (!CHARACTER_DISCLOSURE_DEFAULTS_V1.includes(entry.disclosureDefault)) {
      throw new TypeError(`entries[${index}].disclosureDefault is invalid.`);
    }
    if (entry.sourceSection !== null) {
      requireText(entry.sourceSection, `entries[${index}].sourceSection`);
    }
    requireText(entry.closureNote, `entries[${index}].closureNote`);
  }

  return registry;
}
