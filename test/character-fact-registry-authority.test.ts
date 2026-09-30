import { describe, expect, it } from 'vitest';
import {
  getCharacterFactRegistryAuthorityV1,
  type CharacterFactRegistryAuthorityRowV1,
  type CharacterFactRegistryReadAuthorityPortV1,
} from '../apps/api/src/character-fact-registry-authority.js';
import {
  prepareCharacterFactRuntimePreflightV1,
} from '../apps/api/src/character-fact-runtime-preflight.js';

class StaticFactAuthorityPort implements CharacterFactRegistryReadAuthorityPortV1 {
  constructor(readonly row: CharacterFactRegistryAuthorityRowV1 | null) {}

  async readFact(): Promise<CharacterFactRegistryAuthorityRowV1 | null> {
    return this.row;
  }
}

function row(
  overrides: Partial<CharacterFactRegistryAuthorityRowV1> = {},
): CharacterFactRegistryAuthorityRowV1 {
  return {
    releaseId: 'release-character-test-v1',
    characterId: 'seyeon',
    factKey: 'past_romance_surface',
    sourceAuthority: 'CANON',
    characterKnowledge: 'KNOWN',
    disclosureDefault: 'FAMILIAR',
    sourceSection: 'J4',
    sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
    sourceBibleRevision: 'source-revision-test',
    value: { exists: true },
    ...overrides,
  };
}

describe('Character fact registry authority', () => {
  it('admits only the exact pinned release / Character / fact selector', async () => {
    await expect(
      getCharacterFactRegistryAuthorityV1({
        releaseId: 'release-character-test-v1',
        characterId: 'seyeon',
        factKey: 'past_romance_surface',
        authorityPort: new StaticFactAuthorityPort(row()),
      }),
    ).resolves.toMatchObject({
      releaseId: 'release-character-test-v1',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
      sourceAuthority: 'CANON',
    });
  });

  it('fails closed on provenance mismatch instead of accepting a nearby Character fact', async () => {
    await expect(
      getCharacterFactRegistryAuthorityV1({
        releaseId: 'release-character-test-v1',
        characterId: 'seyeon',
        factKey: 'past_romance_surface',
        authorityPort: new StaticFactAuthorityPort(
          row({ characterId: 'yeoul' }),
        ),
      }),
    ).rejects.toMatchObject({
      code: 'PROVENANCE_MISMATCH',
    });
  });

  it('requires resolved authority to carry a source value', async () => {
    const invalid = row();
    const { value: _value, ...withoutValue } = invalid;

    await expect(
      getCharacterFactRegistryAuthorityV1({
        releaseId: invalid.releaseId,
        characterId: invalid.characterId,
        factKey: invalid.factKey,
        authorityPort: new StaticFactAuthorityPort(withoutValue),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_AUTHORITY_ROW',
    });
  });

  it('forbids unresolved World-dependent facts from carrying invented values', async () => {
    await expect(
      getCharacterFactRegistryAuthorityV1({
        releaseId: 'release-character-test-v1',
        characterId: 'seyeon',
        factKey: 'principle_calling_binding',
        authorityPort: new StaticFactAuthorityPort(
          row({
            factKey: 'principle_calling_binding',
            sourceAuthority: 'WORLD_DEPENDENT',
            disclosureDefault: 'NOT_APPLICABLE',
            value: { principleId: 'must-not-exist' },
          }),
        ),
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_AUTHORITY_ROW',
    });
  });

  it('returns a typed not-found authority failure', async () => {
    await expect(
      getCharacterFactRegistryAuthorityV1({
        releaseId: 'release-character-test-v1',
        characterId: 'seyeon',
        factKey: 'missing_fact',
        authorityPort: new StaticFactAuthorityPort(null),
      }),
    ).rejects.toMatchObject({
      code: 'FACT_NOT_FOUND',
    });
  });
});

describe('Character fact runtime preflight bridge', () => {
  it('blocks disclosure before retrieval when the Character does not know the fact', async () => {
    const result = await prepareCharacterFactRuntimePreflightV1({
      releaseId: 'release-character-test-v1',
      characterId: 'seyeon',
      factKey: 'hidden_world_fact',
      relationshipStage: 'deep_trust',
      trustBand: 'high',
      contextualEligibility: true,
      characterSpecificBoundaryAllows: true,
      requestedDepth: 'surface',
      allowedDepth: 'surface',
      ineligibleResult: 'BOUNDARY',
      authorityPort: new StaticFactAuthorityPort(
        row({
          factKey: 'hidden_world_fact',
          characterKnowledge: 'UNKNOWN_TO_CHARACTER',
          disclosureDefault: 'DEEP_TRUST',
        }),
      ),
    });

    expect(result).toMatchObject({
      status: 'knowledge_blocked',
      reason: 'unknown_to_character',
      retrieval: { scope: 'none' },
    });
  });

  it('uses the fact registry disclosure default instead of caller-authored disclosure authority', async () => {
    const result = await prepareCharacterFactRuntimePreflightV1({
      releaseId: 'release-character-test-v1',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
      relationshipStage: 'public',
      trustBand: 'low',
      contextualEligibility: false,
      characterSpecificBoundaryAllows: true,
      requestedDepth: 'surface',
      allowedDepth: 'surface',
      ineligibleResult: 'BOUNDARY',
      authorityPort: new StaticFactAuthorityPort(row()),
    });

    expect(result).toMatchObject({
      status: 'disclosure_decided',
      disclosure: {
        result: 'BOUNDARY',
        reason: 'relationship_gate',
        retrieval: { scope: 'none' },
      },
    });
  });

  it('allows bounded retrieval after the registry gate opens', async () => {
    const result = await prepareCharacterFactRuntimePreflightV1({
      releaseId: 'release-character-test-v1',
      characterId: 'seyeon',
      factKey: 'past_romance_surface',
      relationshipStage: 'familiar',
      trustBand: 'medium',
      contextualEligibility: false,
      characterSpecificBoundaryAllows: true,
      requestedDepth: 'surface',
      allowedDepth: 'surface',
      ineligibleResult: 'BOUNDARY',
      authorityPort: new StaticFactAuthorityPort(row()),
    });

    expect(result).toMatchObject({
      status: 'disclosure_decided',
      disclosure: {
        result: 'ALLOW',
        retrieval: {
          scope: 'bounded',
          depth: 'surface',
        },
      },
    });
  });

  it('keeps unresolved Principle/Calling authority empty and returns authority abstention', async () => {
    const unresolvedCalling = row({
      factKey: 'principle_calling_binding',
      sourceAuthority: 'WORLD_DEPENDENT',
      characterKnowledge: 'NOT_APPLICABLE',
      disclosureDefault: 'NOT_APPLICABLE',
    });
    const { value: _value, ...withoutValue } = unresolvedCalling;

    const result = await prepareCharacterFactRuntimePreflightV1({
      releaseId: 'release-character-test-v1',
      characterId: 'seyeon',
      factKey: 'principle_calling_binding',
      relationshipStage: 'public',
      trustBand: 'low',
      contextualEligibility: false,
      characterSpecificBoundaryAllows: true,
      requestedDepth: 'surface',
      allowedDepth: 'surface',
      ineligibleResult: 'BOUNDARY',
      authorityPort: new StaticFactAuthorityPort(withoutValue),
    });

    expect(result).toMatchObject({
      status: 'disclosure_decided',
      fact: {
        sourceAuthority: 'WORLD_DEPENDENT',
      },
      disclosure: {
        result: 'AUTHORITY_ABSTAIN',
        reason: 'source_authority_unresolved',
        retrieval: { scope: 'none' },
      },
    });
    expect('value' in result.fact).toBe(false);
  });
});
