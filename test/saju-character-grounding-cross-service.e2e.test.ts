import { describe, expect, it, vi } from 'vitest';
import type { CharacterRuntimeContextV1 } from '../packages/domain/src/index.js';
import {
  runReaderInterpretationPreviewV1,
  type OfficialReadingCharacterGroundingProjectionPortV1,
} from '../apps/api/src/reader-interpretation-preview-runtime-v1.js';
import {
  SajuCharacterGroundingHttpAdapterErrorV1,
  createSajuCharacterGroundingHttpAdapterV1,
} from '../apps/api/src/saju-character-grounding-http-adapter.js';
import type {
  CharacterStandardReadingAccessAuthorityPortV1,
  CharacterStandardReadingArtifactAuthorityPortV1,
} from '../apps/api/src/character-standard-reading-knowledge.js';

const RUN_E2E = process.env.MYEONGHA_RUN_SAJU_GROUNDING_CROSS_SERVICE_E2E === '1';
const describeE2e = RUN_E2E ? describe : describe.skip;

const SUBJECT_ID = 'subject-cross-service-1';
const READING_ID = 'official-reading-cross-service-1';
const READER_ID = 'baekheon';
const BUNDLE_ID = 'bundle-baekheon-cross-service-v1';
const RESPONSE_VERSION = 'myeonghwa-product-reading-response-v2';
const ENGINE_VERSION = 'saju-cross-service-engine-v1';
const OFFICIAL_ARTIFACT_HASH = 'sha256:cross-service-official-artifact';
const TIMING_TEXT = '긴 시간축에서 반복되는 흐름을 확인해야 합니다.';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(name + ' is required for the cross-service E2E.');
  }
  return value.trim();
}

function deliveredResponse(): Record<string, unknown> {
  return {
    responseId: 'reading_response_0123456789abcdef01234567',
    responseVersion: RESPONSE_VERSION,
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId: READING_ID,
      brand: {
        brandId: 'myeonghwa',
        displayName: '명화',
      },
      subject: {
        displayLabel: 'Cross-service fixture',
        birthInputDisplay: {
          calendarType: 'solar',
          date: '1996-01-09',
          time: '09:30',
          timeKnown: true,
          birthplaceLabel: '서울',
        },
        calculationState: 'resolved',
      },
      calculationSummary: {
        pillars: {
          year: { label: '년주', value: '갑자', status: 'resolved' },
          month: { label: '월주', value: '을축', status: 'resolved' },
          day: { label: '일주', value: '병인', status: 'resolved' },
          hour: { label: '시주', value: '정묘', status: 'resolved' },
        },
      },
      sections: [
        {
          sectionType: 'timing',
          title: '흐름',
          blocks: [{ type: 'paragraph', text: TIMING_TEXT }],
          state: 'complete',
        },
      ],
      disclosures: [],
      generatedAt: '2026-09-21T00:00:00.000Z',
    },
  };
}

function readerContext(): CharacterRuntimeContextV1 {
  const speech = {
    register: 'baekheon cross-service fixture register',
    sentenceRhythm: 'fixture rhythm',
    directness: 'medium',
    warmth: 'medium',
    profanity: 'none',
    forbiddenBehaviors: [],
  } as const;
  const communication = {
    register: 'baekheon cross-service fixture register',
    sentenceRhythm: 'fixture rhythm',
    verbosity: 'medium',
    humorStyle: 'none',
    metaphorStyle: 'none',
    profanityIntensity: 'none',
    politenessStyle: 'respectful',
  } as const;

  return {
    schemaVersion: 'v1',
    characterId: READER_ID,
    contentBundleId: BUNDLE_ID,
    contentVersion: 'cross-service-content-v1',
    speech,
    voiceAuthority: {
      characterId: READER_ID,
      surface: 'saju_product',
      source: 'published_character_content',
      contentVersion: 'cross-service-content-v1',
      speech,
      communication,
    },
    canon: {},
    persona: { communication },
    behavior: {},
    sajuProfile: {
      profileVersion: 'character-saju-profile-v1',
      attentionAxes: ['long_cycle', 'accumulated_consequence', 'endurance'],
      followUpQuestionStrategies: ['fixture_question'],
      safeFraming: {
        schemaVersion: 'v1',
        catalogVersion: 'cross-service-safe-framing-v1',
        before: [
          {
            key: 'baekheon_record_transition',
            text: '확인된 기록만 기준으로 보겠습니다.',
            purpose: 'record_transition',
          },
          {
            key: 'baekheon_current_life_question',
            text: '실제로 반복되어 온 흐름인지부터 확인하겠습니다.',
            purpose: 'current_life_question',
          },
        ],
        after: [
          {
            key: 'baekheon_uncertainty_transition',
            text: '확정할 수 없는 부분은 그대로 남기겠습니다.',
            purpose: 'uncertainty_transition',
          },
          {
            key: 'baekheon_relationship_transition',
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
      readingRef: READING_ID,
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'cross-service-capability-v1',
      },
      groundingRef: null,
    },
  } as unknown as CharacterRuntimeContextV1;
}

function authorityPorts(active: boolean): {
  accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
} {
  return {
    accessAuthorityPort: {
      async readAccessibleReadings() {
        if (!active) return [];
        return [{
          subjectId: SUBJECT_ID,
          readingId: READING_ID,
          readingSessionId: 'official-reading-session-cross-service-1',
          productId: 'standard-reading-product-1',
          readerCharacterId: READER_ID,
          readerContentBundleId: BUNDLE_ID,
          topicKey: 'general',
          sajuDomain: 'general',
          readingPeriod: 'original',
          readingVariant: 'standard',
          sourceBirthRevisionId: 'birth-revision-cross-service-1',
          productSpecVersion: 'standard-reading-v1',
          domainCapabilityVersion: 'general-v1',
          readingContractVersion: RESPONSE_VERSION,
          sajuEngineVersion: ENGINE_VERSION,
          responseHash: OFFICIAL_ARTIFACT_HASH,
        }];
      },
    },
    artifactAuthorityPort: {
      async readArtifactSource() {
        if (!active) return [];
        return [{
          readingId: READING_ID,
          productId: 'standard-reading-product-1',
          readerCharacterId: READER_ID,
          readingContractVersion: RESPONSE_VERSION,
          productResponseState: 'delivered',
          responseSnapshotJsonb: deliveredResponse(),
          responseHash: OFFICIAL_ARTIFACT_HASH,
          completedAt: '2026-09-21T00:00:00.000Z',
        }];
      },
    },
  };
}

function liveProjectionPort(): OfficialReadingCharacterGroundingProjectionPortV1 {
  return createSajuCharacterGroundingHttpAdapterV1({
    baseUrl: requiredEnv('MYEONGHA_SAJU_CROSS_SERVICE_ORIGIN'),
    bearerToken: requiredEnv('MYEONGHA_SAJU_CROSS_SERVICE_BEARER'),
    timeoutMs: 5_000,
  });
}

async function runPreview(
  groundingProjectionPort: OfficialReadingCharacterGroundingProjectionPortV1,
  active = true,
) {
  return runReaderInterpretationPreviewV1({
    resolvedSubjectId: SUBJECT_ID,
    officialReadingId: READING_ID,
    readerCharacterId: READER_ID,
    effectiveAt: '2026-09-21T00:00:00.000Z',
    requestedDomain: 'general',
    context: readerContext(),
    groundingProjectionPort,
    ...authorityPorts(active),
  });
}

describeE2e('Reader Preview ↔ Saju Character grounding cross-service E2E v1', () => {
  it('round-trips an Official Reading through the authenticated Saju host into bounded Reader output', async () => {
    const envelope = await runPreview(liveProjectionPort());

    expect(envelope.mode).toBe('reader_interpretation');
    expect(envelope.officialReadingId).toBe(READING_ID);
    expect(envelope.readerCharacterId).toBe(READER_ID);
    expect(envelope.officialArtifactResponseHash).toBe(OFFICIAL_ARTIFACT_HASH);
    expect(envelope.sourceResponseHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(envelope.groundingHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(envelope.sourceResponseHash).not.toBe(OFFICIAL_ARTIFACT_HASH);

    if (envelope.mode !== 'reader_interpretation') {
      throw new Error('Expected bounded Reader interpretation.');
    }
    expect(
      envelope.utterance.segments.some(
        (segment) =>
          segment.kind === 'semantic_realization' && segment.text === TIMING_TEXT,
      ),
    ).toBe(true);
  });

  it('is rejected by the real Saju host when the service bearer is wrong', async () => {
    const adapter = createSajuCharacterGroundingHttpAdapterV1({
      baseUrl: requiredEnv('MYEONGHA_SAJU_CROSS_SERVICE_ORIGIN'),
      bearerToken: 'wrong-cross-service-bearer',
      timeoutMs: 5_000,
    });

    await expect(
      adapter.projectGrounding({
        readingId: READING_ID,
        readingContractVersion: RESPONSE_VERSION,
        productResponseState: 'delivered',
        responseSnapshotJsonb: deliveredResponse(),
        officialArtifactResponseHash: OFFICIAL_ARTIFACT_HASH,
        sajuEngineVersion: ENGINE_VERSION,
        sajuDomain: 'general',
      }),
    ).rejects.toMatchObject({
      code: 'HTTP_4XX',
      httpStatus: 401,
    } satisfies Partial<SajuCharacterGroundingHttpAdapterErrorV1>);
  });

  it('denies a revoked Reader before any cross-service grounding request is sent', async () => {
    const live = liveProjectionPort();
    const projectGrounding = vi.fn(
      live.projectGrounding.bind(live),
    ) as OfficialReadingCharacterGroundingProjectionPortV1['projectGrounding'];

    await expect(
      runPreview({ projectGrounding }, false),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(projectGrounding).not.toHaveBeenCalled();
  });
});
