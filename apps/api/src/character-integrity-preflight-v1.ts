import {
  CHARACTER_INTEGRITY_CLAIM_KINDS_V1,
  CHARACTER_INTEGRITY_RESOLVER_REQUIRED_KINDS_V1,
  evaluateCharacterIntegrityClaimV1,
  type CharacterIntegrityAuthorityEvidenceV1,
  type CharacterIntegrityClaimKindV1,
  type CharacterIntegrityClaimV1,
  type CharacterIntegrityDecisionV1,
} from '../../../packages/domain/src/character-integrity-gate-v1.js';

export const CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1 =
  'character-integrity-preflight-v1' as const;

export interface CharacterIntegrityClassifierClaimV1 {
  readonly claimId: string;
  readonly kind: CharacterIntegrityClaimKindV1;
  readonly statement: string;
}

export interface CharacterIntegrityClassificationV1 {
  readonly claims: readonly CharacterIntegrityClassifierClaimV1[];
}

export interface CharacterIntegrityClaimClassifierPortV1 {
  classify(input: {
    readonly characterId: string;
    readonly userText: string;
  }): unknown | Promise<unknown>;
}

export interface CharacterIntegrityAuthorityResolverPortV1 {
  resolve(input: {
    readonly characterId: string;
    readonly claim: CharacterIntegrityClaimV1;
  }):
    | CharacterIntegrityAuthorityEvidenceV1
    | Promise<CharacterIntegrityAuthorityEvidenceV1>;
}

export interface CharacterIntegrityPreflightResultV1 {
  readonly schemaVersion: typeof CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1;
  readonly characterId: string;
  readonly userMessageRef: string;
  readonly classification: CharacterIntegrityClassificationV1;
  readonly decisions: readonly CharacterIntegrityDecisionV1[];
}

function requireText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 4000) {
    throw new TypeError(`${path} must be a non-empty string within 4000 characters.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function guardCharacterIntegrityClassificationV1(
  raw: unknown,
): CharacterIntegrityClassificationV1 {
  if (!isRecord(raw)) {
    throw new TypeError('Character integrity classification must be an object.');
  }

  const unexpected = Object.keys(raw).find((key) => key !== 'claims');
  if (unexpected) {
    throw new TypeError(
      `Character integrity classification contains unexpected field: ${unexpected}`,
    );
  }

  if (!Array.isArray(raw.claims) || raw.claims.length > 8) {
    throw new TypeError(
      'Character integrity classification claims must be an array with at most 8 items.',
    );
  }

  const seen = new Set<string>();
  const claims = raw.claims.map((claim, index) => {
    if (!isRecord(claim)) {
      throw new TypeError(`claims[${index}] must be an object.`);
    }

    const unexpectedClaimField = Object.keys(claim).find(
      (key) => !['claimId', 'kind', 'statement'].includes(key),
    );
    if (unexpectedClaimField) {
      throw new TypeError(
        `claims[${index}] contains unexpected field: ${unexpectedClaimField}`,
      );
    }

    const claimId = requireText(String(claim.claimId ?? ''), `claims[${index}].claimId`);
    if (seen.has(claimId)) {
      throw new TypeError('Character integrity classification claimId values must be unique.');
    }
    seen.add(claimId);

    const kind = claim.kind;
    if (
      typeof kind !== 'string' ||
      !CHARACTER_INTEGRITY_CLAIM_KINDS_V1.includes(
        kind as CharacterIntegrityClaimKindV1,
      )
    ) {
      throw new TypeError(`claims[${index}].kind is invalid.`);
    }

    return Object.freeze({
      claimId,
      kind: kind as CharacterIntegrityClaimKindV1,
      statement: requireText(
        String(claim.statement ?? ''),
        `claims[${index}].statement`,
      ),
    });
  });

  return Object.freeze({
    claims: Object.freeze(claims),
  });
}

function requiresAuthorityResolver(
  kind: CharacterIntegrityClaimKindV1,
): boolean {
  return CHARACTER_INTEGRITY_RESOLVER_REQUIRED_KINDS_V1.includes(
    kind as (typeof CHARACTER_INTEGRITY_RESOLVER_REQUIRED_KINDS_V1)[number],
  );
}

export async function runCharacterIntegrityPreflightV1(input: {
  readonly characterId: string;
  readonly userMessageRef: string;
  readonly userText: string;
  readonly classifier: CharacterIntegrityClaimClassifierPortV1;
  readonly authorityResolver: CharacterIntegrityAuthorityResolverPortV1;
}): Promise<CharacterIntegrityPreflightResultV1> {
  const characterId = requireText(input.characterId, 'characterId');
  const userMessageRef = requireText(input.userMessageRef, 'userMessageRef');
  const userText = requireText(input.userText, 'userText');

  const classification = guardCharacterIntegrityClassificationV1(
    await input.classifier.classify({
      characterId,
      userText,
    }),
  );

  const decisions: CharacterIntegrityDecisionV1[] = [];

  for (const classified of classification.claims) {
    const claim: CharacterIntegrityClaimV1 = Object.freeze({
      claimId: classified.claimId,
      kind: classified.kind,
      statement: classified.statement,
      sourceRef: userMessageRef,
    });

    const evidence = requiresAuthorityResolver(claim.kind)
      ? await input.authorityResolver.resolve({
          characterId,
          claim,
        })
      : undefined;

    decisions.push(
      evaluateCharacterIntegrityClaimV1({
        claim,
        evidence,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: CHARACTER_INTEGRITY_PREFLIGHT_SCHEMA_VERSION_V1,
    characterId,
    userMessageRef,
    classification,
    decisions: Object.freeze(decisions),
  });
}
