import { describe, expect, it, vi } from 'vitest';
import type {
  CharacterRuntimeContextV1,
  CharacterSajuGroundingBundleViewV1,
} from '../packages/domain/src/index.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  hashCharacterSajuGroundingBundleMaterialV1,
} from '../packages/domain/src/index.js';
import {
  attachCharacterStandardReadingGroundingV1,
  projectCharacterStandardReadingGroundingV1,
  type SajuCharacterGroundingProjectionPortV1,
} from '../apps/api/src/index.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from '../apps/api/src/character-standard-reading-knowledge.js';

const SOURCE_HASH = 'a'.repeat(64);

function source(
  overrides: Partial<CharacterStandardReadingKnowledgeSourceV1> = {},
): CharacterStandardReadingKnowledgeSourceV1 {
  return {
    readingId: '11111111-1111-4111-8111-111111111111',
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: '33333333-3333-4333-8333-333333333333',
    readerCharacterId: 'baekheon',
    topicKey: 'general',
    sajuDomain: 'general',
    readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    productSpecVersion: 'standard-reading-v1',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    sajuEngineVersion: 'saju-engine-v1',
    responseHash: SOURCE_HASH,
    productResponseState: 'delivered',
    responseSnapshotJsonb: {
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'delivered',
      reading: { readingId: '11111111-1111-4111-8111-111111111111' },
    },
    completedAt: '2026-09-21T00:00:00.000Z',
    ...overrides,
  };
}

function grounding(
  overrides: Partial<CharacterSajuGroundingBundleViewV1> = {},
): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: '11111111-1111-4111-8111-111111111111',
    productResponseVersion: 'myeonghwa-product-reading-response-v2',
    engineVersion: 'saju-engine-v1',
    readingDomain: 'general' as const,
    sourceResponseHash: SOURCE_HASH,
    units: [
      {
        unitId: `grounding_unit_${'1'.repeat(24)}`,
        domain: 'general' as const,
        axis: 'core_identity' as const,
        narrativeRole: 'primary' as const,
        semanticKey: 'overview:paragraph',
        canonicalMeaning: '공식 사주 Source Truth에서 나온 핵심 의미',
        sourceBlockRefs: ['sections.0.blocks.0'],
        requiredCompanionUnitRefs: [],
        requiredDisclosureRefs: [],
        realizationPolicyRef: 'bounded_semantic_paraphrase_v1' as const,
      },
    ],
    disclosures: [],
    ambiguities: [],
  };
  const base = {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
  return { ...base, ...overrides } as CharacterSajuGroundingBundleViewV1;
}

function projectionPort(candidate = grounding()): SajuCharacterGroundingProjectionPortV1 {
  return {
    projectOfficialReading: vi.fn(async () => candidate),
  };
}

function runtimeContext(overrides: Partial<CharacterRuntimeContextV1> = {}): CharacterRuntimeContextV1 {
  return {
    characterId: 'baekheon',
    saju: {
      readingRef: '11111111-1111-4111-8111-111111111111',
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'character-saju-capability-v1',
      },
    },
    ...overrides,
  } as CharacterRuntimeContextV1;
}

describe('Official Reading -> Character grounding bridge', () => {
  it('projects only the server-read Official Reading snapshot through Saju source authority', async () => {
    const knowledge = source();
    const port = projectionPort();

    const result = await projectCharacterStandardReadingGroundingV1({
      source: knowledge,
      projectionPort: port,
    });

    expect(port.projectOfficialReading).toHaveBeenCalledWith({
      response: knowledge.responseSnapshotJsonb,
      engineVersion: 'saju-engine-v1',
      readingDomain: 'general',
    });
    expect(result.groundingRef).toMatchObject({
      readingRef: knowledge.readingId,
      productResponseVersion: knowledge.readingContractVersion,
      engineVersion: knowledge.sajuEngineVersion,
      readingDomain: knowledge.sajuDomain,
      sourceResponseHash: knowledge.responseHash,
    });
    expect(result.grounding.units[0]?.canonicalMeaning).toBe(
      '공식 사주 Source Truth에서 나온 핵심 의미',
    );
  });

  it('fails before projection when the stored ProductReadingResponse is not delivered', async () => {
    const port = projectionPort();

    await expect(
      projectCharacterStandardReadingGroundingV1({
        source: source({ productResponseState: 'failed' }),
        projectionPort: port,
      }),
    ).rejects.toThrow(/Only a delivered official ProductReadingResponse/u);
    expect(port.projectOfficialReading).not.toHaveBeenCalled();
  });

  it('fails before projection when stored response hash is not the source hash contract', async () => {
    const port = projectionPort();

    await expect(
      projectCharacterStandardReadingGroundingV1({
        source: source({ responseHash: 'sha256:v1:not-source-contract' }),
        projectionPort: port,
      }),
    ).rejects.toThrow(/response hash.*lower-case SHA-256/u);
    expect(port.projectOfficialReading).not.toHaveBeenCalled();
  });

  it('rejects a source projector response for another official Reading', async () => {
    const other = grounding({
      readingRef: '99999999-9999-4999-8999-999999999999',
    });
    const port = projectionPort(other);

    await expect(
      projectCharacterStandardReadingGroundingV1({
        source: source(),
        projectionPort: port,
      }),
    ).rejects.toThrow(/readingRef does not match admitted grounding identity/u);
  });

  it('rejects projector output whose source response hash differs from DB provenance', async () => {
    const other = grounding({
      sourceResponseHash: 'b'.repeat(64),
    });
    const port = projectionPort(other);

    await expect(
      projectCharacterStandardReadingGroundingV1({
        source: source(),
        projectionPort: port,
      }),
    ).rejects.toThrow(/sourceResponseHash does not match admitted grounding identity/u);
  });

  it('rejects semantic tampering even when the attacker leaves the old grounding hash', async () => {
    const valid = grounding();
    const tampered = {
      ...valid,
      units: [
        {
          ...valid.units[0]!,
          canonicalMeaning: '변조된 의미',
        },
      ],
    };
    const port = projectionPort(tampered as CharacterSajuGroundingBundleViewV1);

    await expect(
      projectCharacterStandardReadingGroundingV1({
        source: source(),
        projectionPort: port,
      }),
    ).rejects.toThrow(/bundle hash does not match bundle content/u);
  });

  it('attaches the admitted grounding identity only to the same Reader and Reading runtime', async () => {
    const projection = await projectCharacterStandardReadingGroundingV1({
      source: source(),
      projectionPort: projectionPort(),
    });

    const attached = attachCharacterStandardReadingGroundingV1({
      context: runtimeContext(),
      projection,
    });

    expect(attached.saju?.groundingRef).toEqual(projection.groundingRef);

    expect(() =>
      attachCharacterStandardReadingGroundingV1({
        context: runtimeContext({ characterId: 'seyeon' }),
        projection,
      }),
    ).toThrow(/Reader does not match/u);

    expect(() =>
      attachCharacterStandardReadingGroundingV1({
        context: runtimeContext({
          saju: {
            ...runtimeContext().saju!,
            readingRef: 'different-reading',
          },
        }),
        projection,
      }),
    ).toThrow(/does not match the active Character Saju context/u);
  });
});
