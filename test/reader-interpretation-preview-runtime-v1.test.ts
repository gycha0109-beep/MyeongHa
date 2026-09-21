import { describe, expect, it, vi } from 'vitest';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterGroundingUnitViewV1,
  type CharacterRuntimeContextWithGroundingV1,
  type CharacterSajuGroundingBundleViewV1,
} from '../packages/domain/src/index.js';
import {
  ReaderInterpretationPreviewRuntimeErrorV1,
  runReaderInterpretationPreviewV1,
  type OfficialReadingCharacterGroundingProjectionPortV1,
} from '../apps/api/src/reader-interpretation-preview-runtime-v1.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingAccessAuthorityRowV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityRowV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';

const SUBJECT_ID = 'subject-reader-runtime-1';
const READING_ID = 'official-reading-1';
const SOURCE_HASH = 'a'.repeat(64);
const OFFICIAL_ARTIFACT_HASH = 'sha256:test-official-reading-artifact';
const ENGINE_VERSION = 'saju-preview-engine-v1';
const RESPONSE_VERSION = 'myeonghwa-product-reading-response-v2';

function unitId(hex: string): string {
  return `grounding_unit_${hex.repeat(24)}`;
}

function makeUnit(
  hex: string,
  axis: CharacterGroundingUnitViewV1['axis'],
  canonicalMeaning: string,
  realizationPolicyRef: CharacterGroundingUnitViewV1['realizationPolicyRef'] =
    'bounded_semantic_paraphrase_v1',
): CharacterGroundingUnitViewV1 {
  return {
    unitId: unitId(hex),
    domain: 'general',
    axis,
    narrativeRole: 'primary',
    semanticKey: `semantic-${hex}`,
    canonicalMeaning,
    sourceBlockRefs: [`sections.0.blocks.${hex}`],
    requiredCompanionUnitRefs: [],
    requiredDisclosureRefs: [],
    realizationPolicyRef,
  };
}

function makeBundle(
  units: readonly CharacterGroundingUnitViewV1[],
): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: READING_ID,
    productResponseVersion: RESPONSE_VERSION,
    engineVersion: ENGINE_VERSION,
    readingDomain: 'general' as const,
    sourceResponseHash: SOURCE_HASH,
    units,
    disclosures: [],
    ambiguities: [],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

const baseBundle = makeBundle([
  makeUnit('1', 'timing', '긴 시간축에서 반복 여부를 확인해야 합니다.'),
  makeUnit('2', 'tension', '서로 다른 압력이 동시에 작동할 수 있습니다.'),
  makeUnit('3', 'strength', '지속할 수 있는 힘이 구조의 한 축입니다.'),
  makeUnit('4', 'responsibility', '책임을 떠안는 방식이 선택에 영향을 줍니다.'),
  makeUnit('5', 'boundary', '경계를 정하는 방식이 중요한 변수입니다.'),
  makeUnit('6', 'decision_style', '결정 뒤의 비용을 확인하는 습관이 필요합니다.'),
]);

type ReaderFixture = {
  readonly characterId: 'baekheon' | 'taegyeom';
  readonly contentBundleId: string;
  readonly attentionAxes: readonly string[];
  readonly currentLifeQuestion: string;
};

const readers: Record<'baekheon' | 'taegyeom', ReaderFixture> = {
  baekheon: {
    characterId: 'baekheon',
    contentBundleId: 'bundle-baekheon-v1',
    attentionAxes: ['long_cycle', 'accumulated_consequence', 'endurance'],
    currentLifeQuestion: '실제로 반복되어 온 흐름인지부터 확인하겠습니다.',
  },
  taegyeom: {
    characterId: 'taegyeom',
    contentBundleId: 'bundle-taegyeom-v1',
    attentionAxes: ['responsibility', 'boundary', 'consequence'],
    currentLifeQuestion: '지금 선택에서 감당할 책임과 경계를 먼저 확인하십시오.',
  },
};

function makeContext(
  bundle: CharacterSajuGroundingBundleViewV1,
  reader: ReaderFixture,
): CharacterRuntimeContextWithGroundingV1 {
  const speech = {
    register: `${reader.characterId} fixture register`,
    sentenceRhythm: 'fixture rhythm',
    directness: 'medium',
    warmth: 'medium',
    profanity: 'none',
    forbiddenBehaviors: [],
  } as const;
  const communication = {
    register: `${reader.characterId} fixture register`,
    sentenceRhythm: 'fixture rhythm',
    verbosity: 'medium',
    humorStyle: 'none',
    metaphorStyle: 'none',
    profanityIntensity: 'none',
    politenessStyle: 'respectful',
  } as const;

  return {
    schemaVersion: 'v1',
    characterId: reader.characterId,
    contentBundleId: reader.contentBundleId,
    contentVersion: 'fixture-content-v1',
    speech,
    voiceAuthority: {
      characterId: reader.characterId,
      surface: 'saju_product',
      source: 'published_character_content',
      contentVersion: 'fixture-content-v1',
      speech,
      communication,
    },
    canon: {},
    persona: { communication },
    behavior: {},
    sajuProfile: {
      profileVersion: 'character-saju-profile-v1',
      attentionAxes: reader.attentionAxes,
      followUpQuestionStrategies: ['fixture_question'],
      safeFraming: {
        schemaVersion: 'v1',
        catalogVersion: 'fixture-safe-framing-v1',
        before: [
          {
            key: `${reader.characterId}_record_transition`,
            text: '확인된 기록만 기준으로 보겠습니다.',
            purpose: 'record_transition',
          },
          {
            key: `${reader.characterId}_current_life_question`,
            text: reader.currentLifeQuestion,
            purpose: 'current_life_question',
          },
        ],
        after: [
          {
            key: `${reader.characterId}_uncertainty_transition`,
            text: '확정할 수 없는 부분은 그대로 남기겠습니다.',
            purpose: 'uncertainty_transition',
          },
          {
            key: `${reader.characterId}_relationship_transition`,
            text: '관계의 결과를 대신 결정하지 않겠습니다.',
            purpose: 'relationship_transition',
          },
        ],
      },
    },
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 1,
      relationshipPolicyVersion: 'relationship-policy-v1',
      projectionPolicyVersion: 'relationship-projection-v1',
      behaviorVersion: 'relationship-behavior-v1',
      matchedBehaviorRuleKey: null,
      stageKey: 'acquainted',
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
      recentEventKeys: [],
      mode: {},
    },
    rendererPolicy: { allowedEmotionIds: [], allowedAnimationCueIds: [] },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: [],
    saju: {
      readingRef: bundle.readingRef,
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'fixture-capability-v1',
      },
      groundingRef: {
        schemaVersion: bundle.schemaVersion,
        groundingProjectionVersion: bundle.groundingProjectionVersion,
        axisRegistryVersion: bundle.axisRegistryVersion,
        readingRef: bundle.readingRef,
        productResponseVersion: bundle.productResponseVersion,
        engineVersion: bundle.engineVersion,
        readingDomain: bundle.readingDomain,
        sourceResponseHash: bundle.sourceResponseHash,
        groundingHash: bundle.groundingHash,
      },
    },
  } as unknown as CharacterRuntimeContextWithGroundingV1;
}

function accessRow(
  readerCharacterId: ReaderFixture['characterId'],
  readerContentBundleId: string,
  responseHash = OFFICIAL_ARTIFACT_HASH,
  readingContractVersion = RESPONSE_VERSION,
): CharacterStandardReadingAccessAuthorityRowV1 {
  return {
    subjectId: SUBJECT_ID,
    readingId: READING_ID,
    readingSessionId: 'official-reading-session-1',
    productId: 'standard-reading-product-1',
    readerCharacterId,
    readerContentBundleId,
    topicKey: 'general',
    sajuDomain: 'general',
    readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: 'birth-revision-1',
    productSpecVersion: 'standard-reading-v1',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion,
    sajuEngineVersion: ENGINE_VERSION,
    responseHash,
  };
}

function officialResponseSnapshot(
  productResponseState = 'delivered',
  readingContractVersion = RESPONSE_VERSION,
): Record<string, unknown> {
  return {
    responseVersion: readingContractVersion,
    state: productResponseState,
    reading: {
      readingId: READING_ID,
      sections: [
        {
          sectionType: 'overview',
          title: '전체',
          blocks: [{ type: 'paragraph', text: '공식 Reading 원문입니다.' }],
        },
      ],
      disclosures: [],
      calculationSummary: {},
    },
  };
}

function artifactRow(
  readerCharacterId: string,
  responseHash = OFFICIAL_ARTIFACT_HASH,
  productResponseState = 'delivered',
  readingContractVersion = RESPONSE_VERSION,
): CharacterStandardReadingArtifactAuthorityRowV1 {
  return {
    readingId: READING_ID,
    productId: 'standard-reading-product-1',
    readerCharacterId,
    readingContractVersion,
    productResponseState,
    responseSnapshotJsonb: officialResponseSnapshot(
      productResponseState,
      readingContractVersion,
    ),
    responseHash,
    completedAt: '2026-09-20T23:00:00.000Z',
  };
}

function authorityPorts(input: {
  readonly activeReaders: readonly ReaderFixture['characterId'][];
  readonly responseHash?: string;
  readonly productResponseState?: string;
  readonly readingContractVersion?: string;
  readonly readerContentBundleId?: string;
}) {
  const active = new Set<string>(input.activeReaders);
  const responseHash = input.responseHash ?? OFFICIAL_ARTIFACT_HASH;
  const productResponseState = input.productResponseState ?? 'delivered';
  const readingContractVersion = input.readingContractVersion ?? RESPONSE_VERSION;
  const accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1 = {
    readAccessibleReadings: vi.fn(async ({ readerCharacterId }) => {
      if (!active.has(readerCharacterId)) return [];
      const reader = readers[readerCharacterId as ReaderFixture['characterId']];
      if (reader === undefined) return [];
      return [
        accessRow(
          reader.characterId,
          input.readerContentBundleId ?? reader.contentBundleId,
          responseHash,
          readingContractVersion,
        ),
      ];
    }),
  };
  const artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1 = {
    readArtifactSource: vi.fn(async ({ readerCharacterId }) =>
      active.has(readerCharacterId)
        ? [artifactRow(readerCharacterId, responseHash, productResponseState, readingContractVersion)]
        : [],
    ),
  };
  return { accessAuthorityPort, artifactAuthorityPort };
}

function groundingProjectionPort(
  bundle: CharacterSajuGroundingBundleViewV1,
): OfficialReadingCharacterGroundingProjectionPortV1 {
  return {
    projectGrounding: vi.fn(async () => bundle),
  };
}

async function run(
  reader: ReaderFixture,
  input: {
    readonly bundle?: CharacterSajuGroundingBundleViewV1;
    readonly ports?: ReturnType<typeof authorityPorts>;
    readonly context?: CharacterRuntimeContextWithGroundingV1;
    readonly resolvedSubjectId?: string;
    readonly projectionPort?: OfficialReadingCharacterGroundingProjectionPortV1;
  } = {},
) {
  const bundle = input.bundle ?? baseBundle;
  const context = input.context ?? makeContext(bundle, reader);
  const ports = input.ports ?? authorityPorts({ activeReaders: [reader.characterId] });
  return runReaderInterpretationPreviewV1({
    resolvedSubjectId: input.resolvedSubjectId ?? SUBJECT_ID,
    officialReadingId: READING_ID,
    readerCharacterId: reader.characterId,
    effectiveAt: '2026-09-21T00:00:00.000Z',
    requestedDomain: 'general',
    context,
    groundingProjectionPort: input.projectionPort ?? groundingProjectionPort(bundle),
    ...ports,
  });
}

describe('Reader Interpretation Preview Runtime v1', () => {
  it('reuses one official Source Truth while different admitted Readers select different source units', async () => {
    const ports = authorityPorts({ activeReaders: ['baekheon', 'taegyeom'] });
    const baekheon = await run(readers.baekheon, { ports });
    const taegyeom = await run(readers.taegyeom, { ports });

    expect(baekheon.mode).toBe('reader_interpretation');
    expect(taegyeom.mode).toBe('reader_interpretation');
    if (baekheon.mode !== 'reader_interpretation' || taegyeom.mode !== 'reader_interpretation') {
      throw new Error('expected Reader interpretations');
    }

    expect(baekheon.officialReadingId).toBe(taegyeom.officialReadingId);
    expect(baekheon.officialArtifactResponseHash).toBe(OFFICIAL_ARTIFACT_HASH);
    expect(taegyeom.officialArtifactResponseHash).toBe(OFFICIAL_ARTIFACT_HASH);
    expect(baekheon.sourceResponseHash).toBe(SOURCE_HASH);
    expect(taegyeom.sourceResponseHash).toBe(SOURCE_HASH);
    expect(baekheon.groundingHash).toBe(taegyeom.groundingHash);
    expect(baekheon.readerCharacterId).not.toBe(taegyeom.readerCharacterId);
    expect(baekheon.utterance.renderedUnitIds).not.toEqual(taegyeom.utterance.renderedUnitIds);

    const officialMeanings = new Set(baseBundle.units.map((unit) => unit.canonicalMeaning));
    for (const envelope of [baekheon, taegyeom]) {
      for (const segment of envelope.utterance.segments) {
        if (segment.kind === 'semantic_realization') {
          expect(officialMeanings.has(segment.text)).toBe(true);
        }
      }
      expect(envelope).not.toHaveProperty('responseSnapshotJsonb');
      expect(envelope).not.toHaveProperty('officialResponse');
    }
  });

  it('requests grounding from the Saju-owned projection boundary using only Official source provenance', async () => {
    const projectionPort = groundingProjectionPort(baseBundle);
    await run(readers.baekheon, { projectionPort });

    expect(projectionPort.projectGrounding).toHaveBeenCalledTimes(1);
    expect(projectionPort.projectGrounding).toHaveBeenCalledWith({
      readingId: READING_ID,
      readingContractVersion: RESPONSE_VERSION,
      productResponseState: 'delivered',
      responseSnapshotJsonb: officialResponseSnapshot(),
      officialArtifactResponseHash: OFFICIAL_ARTIFACT_HASH,
      sajuEngineVersion: ENGINE_VERSION,
      sajuDomain: 'general',
    });
    const projectionInput = vi.mocked(projectionPort.projectGrounding).mock.calls[0]?.[0];
    expect(projectionInput).not.toHaveProperty('readerCharacterId');
    expect(projectionInput).not.toHaveProperty('readerContentBundleId');
    expect(projectionInput).not.toHaveProperty('subjectId');
  });

  it('fails closed when the Saju projection returns a bundle that is not admitted by the active grounding ref', async () => {
    const tampered = {
      ...baseBundle,
      sourceResponseHash: 'b'.repeat(64),
    };
    await expect(
      run(readers.baekheon, {
        projectionPort: {
          projectGrounding: vi.fn(async () => tampered),
        },
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });

  it('fails closed before artifact admission when the selected Reader has no active access', async () => {
    const ports = authorityPorts({ activeReaders: [] });
    await expect(run(readers.baekheon, { ports })).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
    expect(ports.artifactAuthorityPort.readArtifactSource).not.toHaveBeenCalled();
  });

  it('rejects a Character runtime context using a different content bundle than DB authority', async () => {
    const swappedContext = {
      ...makeContext(baseBundle, readers.baekheon),
      contentBundleId: 'bundle-baekheon-swapped',
    } as CharacterRuntimeContextWithGroundingV1;

    await expect(
      run(readers.baekheon, {
        context: swappedContext,
        ports: authorityPorts({ activeReaders: ['baekheon'] }),
      }),
    ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH' });
  });

  it('does not trust a caller-carried grounding ref and rebuilds it from the Saju projection', async () => {
    const context = makeContext(baseBundle, readers.baekheon);
    const withoutGroundingRef = {
      ...context,
      saju: context.saju === null ? null : { ...context.saju, groundingRef: null },
    } as CharacterRuntimeContextWithGroundingV1;

    const result = await run(readers.baekheon, { context: withoutGroundingRef });
    expect(result.mode).toBe('reader_interpretation');
    expect(result.sourceResponseHash).toBe(SOURCE_HASH);
    expect(result.groundingHash).toBe(baseBundle.groundingHash);
  });

  it('fails closed when the active Reader has no reviewed grounding-axis perspective', async () => {
    const unsupportedContext = {
      ...makeContext(baseBundle, readers.baekheon),
      characterId: 'seyeon',
      contentBundleId: 'bundle-seyeon-v1',
      sajuProfile: {
        ...makeContext(baseBundle, readers.baekheon).sajuProfile,
        profileVersion: 'seyeon-saju-profile-v1',
        attentionAxes: ['whole_pattern', 'competing_signals', 'long_horizon_balance'],
      },
    } as unknown as CharacterRuntimeContextWithGroundingV1;

    const accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1 = {
      readAccessibleReadings: vi.fn(async () => [{
        subjectId: SUBJECT_ID,
        readingId: READING_ID,
        readingSessionId: 'official-reading-session-1',
        productId: 'standard-reading-product-1',
        readerCharacterId: 'seyeon',
        readerContentBundleId: 'bundle-seyeon-v1',
        topicKey: 'general',
        sajuDomain: 'general',
        readingPeriod: 'original',
        readingVariant: 'standard',
        sourceBirthRevisionId: 'birth-revision-1',
        productSpecVersion: 'standard-reading-v1',
        domainCapabilityVersion: 'general-v1',
        readingContractVersion: RESPONSE_VERSION,
        sajuEngineVersion: ENGINE_VERSION,
        responseHash: OFFICIAL_ARTIFACT_HASH,
      }]),
    };
    const artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1 = {
      readArtifactSource: vi.fn(async () => [artifactRow('seyeon')]),
    };

    const projectionPort = groundingProjectionPort(baseBundle);

    await expect(
      runReaderInterpretationPreviewV1({
        resolvedSubjectId: SUBJECT_ID,
        officialReadingId: READING_ID,
        readerCharacterId: 'seyeon',
        effectiveAt: '2026-09-21T00:00:00.000Z',
        requestedDomain: 'general',
        context: unsupportedContext,
        groundingProjectionPort: projectionPort,
        accessAuthorityPort,
        artifactAuthorityPort,
      }),
    ).rejects.toMatchObject({ code: 'PERSPECTIVE_UNAVAILABLE' });

    expect(projectionPort.projectGrounding).not.toHaveBeenCalled();
  });

  it('does not let one Reader borrow another Reader runtime context', async () => {
    const baekheonContext = makeContext(baseBundle, readers.baekheon);
    await expect(
      run(readers.taegyeom, {
        context: baekheonContext,
        ports: authorityPorts({ activeReaders: ['taegyeom'] }),
      }),
    ).rejects.toBeInstanceOf(ReaderInterpretationPreviewRuntimeErrorV1);
  });

  it('keeps the committed Official artifact hash distinct from the Saju semantic source hash', async () => {
    const result = await run(readers.baekheon, {
      ports: authorityPorts({
        activeReaders: ['baekheon'],
        responseHash: 'sha256:opaque-db-artifact-hash-contract',
      }),
    });

    expect(result.officialArtifactResponseHash).toBe(
      'sha256:opaque-db-artifact-hash-contract',
    );
    expect(result.sourceResponseHash).toBe(SOURCE_HASH);
    expect(result.officialArtifactResponseHash).not.toBe(result.sourceResponseHash);
  });


  it('rejects a non-delivered official Product Reading source even when DB access is active', async () => {
    await expect(
      run(readers.baekheon, {
        ports: authorityPorts({
          activeReaders: ['baekheon'],
          productResponseState: 'partial_evidence',
        }),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });

  it('rejects grounding built for a different Product Reading response contract version', async () => {
    await expect(
      run(readers.baekheon, {
        ports: authorityPorts({
          activeReaders: ['baekheon'],
          readingContractVersion: 'myeonghwa-product-reading-response-v999',
        }),
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' });
  });

  it('revoking Reader A leaves Reader B independently usable', async () => {
    const ports = authorityPorts({ activeReaders: ['taegyeom'] });

    await expect(run(readers.baekheon, { ports })).rejects.toMatchObject({
      code: 'ACCESS_DENIED',
    });
    const readerB = await run(readers.taegyeom, { ports });
    expect(readerB.mode).toBe('reader_interpretation');
    expect(readerB.readerCharacterId).toBe('taegyeom');
  });

  it('returns protected fallback without fabricating semantic text when selected material includes protected-only source', async () => {
    const protectedBundle = makeBundle([
      makeUnit('1', 'timing', '선택 가능한 공식 의미가 함께 존재합니다.'),
      {
        ...makeUnit(
          '2',
          'tension',
          '이 문장은 보호된 원문 경로에서만 표시되어야 합니다.',
          'protected_only_v1',
        ),
        narrativeRole: 'limitation',
      },
    ]);
    const result = await run(readers.baekheon, { bundle: protectedBundle });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.fallbackReason).toBe('renderer_protected_fallback');
    expect(result).not.toHaveProperty('utterance');
  });

  it('is deterministic for the same official Reading, Reader, grounding, and perspective', async () => {
    const ports = authorityPorts({ activeReaders: ['baekheon'] });
    const first = await run(readers.baekheon, { ports });
    const second = await run(readers.baekheon, { ports });

    expect(second).toEqual(first);
    expect(second.interpretationHash).toBe(first.interpretationHash);
  });

  it('rejects missing resolved subject before consulting Reader authority', async () => {
    await expect(
      run(readers.baekheon, { resolvedSubjectId: ' ' }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
