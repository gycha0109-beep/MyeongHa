import {
  CHARACTER_INTEGRITY_CLAIM_KINDS_V1,
  CHARACTER_INTEGRITY_AUTHORITY_MATCHES_V1,
  CHARACTER_INTEGRITY_AUTHORITY_SOURCE_KINDS_V1,
  evaluateCharacterIntegrityClaimV1,
  type CharacterIntegrityAuthorityEvidenceV1,
  type CharacterIntegrityAuthorityMatchV1,
  type CharacterIntegrityAuthoritySourceKindV1,
  type CharacterIntegrityClaimKindV1,
  type CharacterIntegrityClaimV1,
  type CharacterIntegrityDecisionV1,
} from '../../../packages/domain/src/character-integrity-gate-v1.js';
import type { CharacterFactAuthorityRecordV1 } from '../../../packages/character-content/src/character-fact-authority-v1.js';
import type { CharacterDisclosureCharacterIdV1 } from '../../../packages/character-content/src/character-disclosure-policy-v1.js';

export const CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1 =
  'character-integrity-preflight-v1' as const;

export interface CharacterIntegrityClassifierPortV1 {
  classify(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly userMessage: string;
  }): unknown | Promise<unknown>;
}

export interface CharacterIntegrityAuthorityResolverPortV1 {
  resolve(input: {
    readonly characterId: CharacterDisclosureCharacterIdV1;
    readonly claim: CharacterIntegrityClaimV1;
  }): unknown | Promise<unknown>;
}

export interface CharacterIntegrityPreflightV1 {
  readonly schemaVersion: typeof CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1;
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly claims: readonly CharacterIntegrityClaimV1[];
  readonly decisions: readonly CharacterIntegrityDecisionV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TypeError(`${path} must be non-empty text within ${maxLength} characters.`);
  }
  return normalized;
}

function parseClaimKind(value: unknown): CharacterIntegrityClaimKindV1 {
  if (
    typeof value !== 'string' ||
    !CHARACTER_INTEGRITY_CLAIM_KINDS_V1.includes(
      value as CharacterIntegrityClaimKindV1,
    )
  ) {
    throw new TypeError('Integrity claim kind is invalid.');
  }
  return value as CharacterIntegrityClaimKindV1;
}

export function guardCharacterIntegrityClassificationV1(
  raw: unknown,
): readonly CharacterIntegrityClaimV1[] {
  if (!Array.isArray(raw) || raw.length > 12) {
    throw new TypeError('Integrity classification must be an array of at most 12 claims.');
  }

  const ids = new Set<string>();
  return Object.freeze(
    raw.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new TypeError(`integrityClaims[${index}] must be an object.`);
      }
      const unexpected = Object.keys(entry).find(
        (key) =>
          key !== 'claimId' &&
          key !== 'kind' &&
          key !== 'normalizedClaim' &&
          key !== 'factKey',
      );
      if (unexpected !== undefined) {
        throw new TypeError(
          `integrityClaims[${index}] contains unexpected field: ${unexpected}`,
        );
      }

      const claimId = requireText(entry.claimId, `integrityClaims[${index}].claimId`, 256);
      if (ids.has(claimId)) {
        throw new TypeError('Integrity claim ids must be unique.');
      }
      ids.add(claimId);

      const kind = parseClaimKind(entry.kind);
      const factKey =
        entry.factKey === null || entry.factKey === undefined
          ? null
          : requireText(entry.factKey, `integrityClaims[${index}].factKey`, 256);
      if (kind === 'CHARACTER_FACT_CLAIM' && factKey === null) {
        throw new TypeError('CHARACTER_FACT_CLAIM requires factKey.');
      }
      if (kind !== 'CHARACTER_FACT_CLAIM' && factKey !== null) {
        throw new TypeError('factKey is only valid for CHARACTER_FACT_CLAIM.');
      }

      return Object.freeze({
        claimId,
        kind,
        normalizedClaim: requireText(
          entry.normalizedClaim,
          `integrityClaims[${index}].normalizedClaim`,
          2000,
        ),
        factKey,
      });
    }),
  );
}

function parseAuthoritySourceKind(
  value: unknown,
): CharacterIntegrityAuthoritySourceKindV1 {
  if (
    typeof value !== 'string' ||
    !CHARACTER_INTEGRITY_AUTHORITY_SOURCE_KINDS_V1.includes(
      value as CharacterIntegrityAuthoritySourceKindV1,
    )
  ) {
    throw new TypeError('Integrity authority sourceKind is invalid.');
  }
  return value as CharacterIntegrityAuthoritySourceKindV1;
}

function parseAuthorityMatch(value: unknown): CharacterIntegrityAuthorityMatchV1 {
  if (
    typeof value !== 'string' ||
    !CHARACTER_INTEGRITY_AUTHORITY_MATCHES_V1.includes(
      value as CharacterIntegrityAuthorityMatchV1,
    )
  ) {
    throw new TypeError('Integrity authority match is invalid.');
  }
  return value as CharacterIntegrityAuthorityMatchV1;
}

export function guardCharacterIntegrityAuthorityEvidenceV1(
  raw: unknown,
): CharacterIntegrityAuthorityEvidenceV1 {
  if (!isRecord(raw)) {
    throw new TypeError('Integrity authority evidence must be an object.');
  }
  const unexpected = Object.keys(raw).find(
    (key) =>
      key !== 'sourceKind' &&
      key !== 'match' &&
      key !== 'sourceRefs' &&
      key !== 'factAuthority',
  );
  if (unexpected !== undefined) {
    throw new TypeError(
      `Integrity authority evidence contains unexpected field: ${unexpected}`,
    );
  }
  if (!Array.isArray(raw.sourceRefs) || raw.sourceRefs.length > 16) {
    throw new TypeError('Integrity authority sourceRefs must be an array of at most 16 refs.');
  }
  const sourceRefs = raw.sourceRefs.map((ref, index) =>
    requireText(ref, `authorityEvidence.sourceRefs[${index}]`, 512),
  );
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    throw new TypeError('Integrity authority sourceRefs must be unique.');
  }

  const factAuthority =
    raw.factAuthority === null || raw.factAuthority === undefined
      ? null
      : (raw.factAuthority as CharacterFactAuthorityRecordV1);

  return Object.freeze({
    sourceKind: parseAuthoritySourceKind(raw.sourceKind),
    match: parseAuthorityMatch(raw.match),
    sourceRefs: Object.freeze(sourceRefs),
    factAuthority,
  });
}

function requiresAuthorityResolution(kind: CharacterIntegrityClaimKindV1): boolean {
  return (
    kind === 'CHARACTER_FACT_CLAIM' ||
    kind === 'SHARED_EVENT_CLAIM' ||
    kind === 'RELATIONSHIP_STATUS_CLAIM' ||
    kind === 'THIRD_PARTY_CLAIM'
  );
}

export async function runCharacterIntegrityPreflightV1(input: {
  readonly characterId: CharacterDisclosureCharacterIdV1;
  readonly userMessage: string;
  readonly classifier: CharacterIntegrityClassifierPortV1;
  readonly authorityResolver: CharacterIntegrityAuthorityResolverPortV1;
}): Promise<CharacterIntegrityPreflightV1> {
  const userMessage = requireText(input.userMessage, 'userMessage', 8000);
  const claims = guardCharacterIntegrityClassificationV1(
    await input.classifier.classify({
      characterId: input.characterId,
      userMessage,
    }),
  );

  const decisions: CharacterIntegrityDecisionV1[] = [];
  for (const claim of claims) {
    const evidence = requiresAuthorityResolution(claim.kind)
      ? guardCharacterIntegrityAuthorityEvidenceV1(
          await input.authorityResolver.resolve({
            characterId: input.characterId,
            claim,
          }),
        )
      : null;

    decisions.push(
      evaluateCharacterIntegrityClaimV1({
        claim,
        evidence,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1,
    characterId: input.characterId,
    claims,
    decisions: Object.freeze(decisions),
  });
}
