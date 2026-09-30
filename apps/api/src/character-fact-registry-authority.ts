import type {
  CharacterRuntimeDisclosureGateV1,
  CharacterRuntimeSourceAuthorityStateV1,
} from '../../../packages/domain/src/index.js';

export const CHARACTER_FACT_KNOWLEDGE_STATES_V1 = [
  'KNOWN',
  'PARTIAL',
  'UNKNOWN_TO_CHARACTER',
  'NOT_APPLICABLE',
] as const;

export type CharacterFactKnowledgeStateV1 =
  (typeof CHARACTER_FACT_KNOWLEDGE_STATES_V1)[number];

export interface CharacterFactRegistryAuthorityRowV1 {
  readonly releaseId: string;
  readonly characterId: string;
  readonly factKey: string;
  readonly sourceAuthority: CharacterRuntimeSourceAuthorityStateV1;
  readonly characterKnowledge: CharacterFactKnowledgeStateV1;
  readonly disclosureDefault: CharacterRuntimeDisclosureGateV1;
  readonly sourceSection: string;
  readonly sourceBibleDocument: string;
  readonly sourceBibleRevision: string;
  /**
   * Optional source-owned value. Unresolved authority states must not carry one.
   * Consumers must not treat absence as secrecy or synthesize a replacement.
   */
  readonly value?: unknown;
  readonly policy?: string;
  readonly closureNote?: string;
}

export interface CharacterFactRegistryReadAuthorityPortV1 {
  readFact(input: {
    readonly releaseId: string;
    readonly characterId: string;
    readonly factKey: string;
  }): Promise<CharacterFactRegistryAuthorityRowV1 | null>;
}

export type CharacterFactRegistryAuthorityErrorCodeV1 =
  | 'INVALID_SELECTOR'
  | 'FACT_NOT_FOUND'
  | 'PROVENANCE_MISMATCH'
  | 'INVALID_AUTHORITY_ROW';

export class CharacterFactRegistryAuthorityErrorV1 extends Error {
  override readonly name = 'CharacterFactRegistryAuthorityErrorV1';

  constructor(
    readonly code: CharacterFactRegistryAuthorityErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function requiredSelector(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 160) {
    throw new CharacterFactRegistryAuthorityErrorV1(
      'INVALID_SELECTOR',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function optionalNonEmpty(value: string | undefined, path: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CharacterFactRegistryAuthorityErrorV1(
      'INVALID_AUTHORITY_ROW',
      `${path} must not be blank when supplied.`,
    );
  }
  return normalized;
}

function sourceAuthorityMayCarryValue(
  sourceAuthority: CharacterRuntimeSourceAuthorityStateV1,
): boolean {
  return sourceAuthority === 'CANON' || sourceAuthority === 'SOFT_CANON';
}

function validateAuthorityRow(
  row: CharacterFactRegistryAuthorityRowV1,
  expected: {
    readonly releaseId: string;
    readonly characterId: string;
    readonly factKey: string;
  },
): CharacterFactRegistryAuthorityRowV1 {
  if (
    row.releaseId !== expected.releaseId ||
    row.characterId !== expected.characterId ||
    row.factKey !== expected.factKey
  ) {
    throw new CharacterFactRegistryAuthorityErrorV1(
      'PROVENANCE_MISMATCH',
      'Character fact registry row does not match the requested pinned release / Character / fact key.',
    );
  }

  const sourceSection = requiredSelector(row.sourceSection, 'sourceSection');
  const sourceBibleDocument = requiredSelector(
    row.sourceBibleDocument,
    'sourceBibleDocument',
  );
  const sourceBibleRevision = requiredSelector(
    row.sourceBibleRevision,
    'sourceBibleRevision',
  );
  const policy = optionalNonEmpty(row.policy, 'policy');
  const closureNote = optionalNonEmpty(row.closureNote, 'closureNote');

  if (!sourceAuthorityMayCarryValue(row.sourceAuthority) && row.value !== undefined) {
    throw new CharacterFactRegistryAuthorityErrorV1(
      'INVALID_AUTHORITY_ROW',
      'Unresolved Character fact authority must not carry a source value.',
    );
  }

  if (sourceAuthorityMayCarryValue(row.sourceAuthority) && row.value === undefined) {
    throw new CharacterFactRegistryAuthorityErrorV1(
      'INVALID_AUTHORITY_ROW',
      'Resolved Character fact authority requires a source value.',
    );
  }

  return Object.freeze({
    ...row,
    sourceSection,
    sourceBibleDocument,
    sourceBibleRevision,
    ...(policy === undefined ? {} : { policy }),
    ...(closureNote === undefined ? {} : { closureNote }),
  });
}

/**
 * Server-authoritative Character fact lookup.
 *
 * factKey is only a selector. Authority comes from the exact row returned by the
 * server-owned port and pinned to the current content release / Character.
 */
export async function getCharacterFactRegistryAuthorityV1(input: {
  readonly releaseId: string;
  readonly characterId: string;
  readonly factKey: string;
  readonly authorityPort: CharacterFactRegistryReadAuthorityPortV1;
}): Promise<CharacterFactRegistryAuthorityRowV1> {
  const releaseId = requiredSelector(input.releaseId, 'releaseId');
  const characterId = requiredSelector(input.characterId, 'characterId');
  const factKey = requiredSelector(input.factKey, 'factKey');

  const row = await input.authorityPort.readFact({
    releaseId,
    characterId,
    factKey,
  });

  if (row === null) {
    throw new CharacterFactRegistryAuthorityErrorV1(
      'FACT_NOT_FOUND',
      'Character fact registry authority returned no exact fact.',
    );
  }

  return validateAuthorityRow(row, {
    releaseId,
    characterId,
    factKey,
  });
}
