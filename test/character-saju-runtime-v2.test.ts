import { describe, expect, it, vi } from 'vitest';
import { SAJU_DOMAINS, type SajuDomain } from '../packages/contracts/src/index.js';
import type { CharacterRuntimeContextV1 } from '../packages/domain/src/character-runtime-context.js';
import type { CharacterPerspectiveProfileV1 } from '../packages/domain/src/character-saju-perspective.js';
import type { CharacterRuntimeContextWithGroundingV1 } from '../packages/domain/src/character-saju-grounding-admission.js';
import {
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
} from '../packages/domain/src/character-saju-grounding-admission.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  selectCharacterInsightsV1,
  selectCharacterInsightsV2,
} from '../packages/domain/src/character-saju-insight-selector.js';
import {
  admitCharacterRuntimeSajuGroundingV2,
  CharacterSajuRuntimeAdmissionErrorV2,
} from '../packages/domain/src/character-saju-runtime-v2.js';
import {
  prepareOfficialReadingReaderAdmissionV1,
} from '../apps/api/src/official-reading-reader-admission-v1.js';
import { issueCharacterSajuOfficialStandardEligibilityV2 } from '../apps/api/src/character-saju-official-eligibility-v2.js';
import { assembleOfficialStandardReaderRuntimeV2 } from '../apps/api/src/character-saju-runtime-v2-bridge.js';
import type { ProductReaderRuleLookupV1 } from '../apps/api/src/product-reader-eligibility-policy-v1.js';
import type { ContentReleaseRuntimeEntry } from '../packages/world-content/src/index.js';

const SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const READING = '11111111-1111-4111-8111-111111111111';
const THREAD = '66666666-6666-4666-8666-666666666666';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const BUNDLE = '55555555-5555-4555-8555-555555555555';
const RELEASE = 'synthetic-character-release';
const EFFECTIVE = '2026-10-09T08:00:00.000Z';
const readers = ['seyeon','baekheon','yeoul','seorin','rahyeon','mira','taegyeom','yunho','doyun'] as const;

function fixture(reader: string, domain: SajuDomain) {
  const access = {
    subjectId: SUBJECT, readingId: READING, readerCharacterId: reader,
    readerContentBundleId: BUNDLE,
    readingSessionId: '22222222-2222-4222-8222-222222222222',
    productId: PRODUCT, productSpecVersion: 'synthetic-standard-v1',
    topicKey: 'general', sajuDomain: domain, readingPeriod: 'original',
    readingVariant: 'standard',
    sourceBirthRevisionId: '44444444-4444-4444-8444-444444444444',
    domainCapabilityVersion: 'general-v1',
    readingContractVersion: 'myeonghwa-product-reading-response-v2',
    sajuEngineVersion: 'saju-engine-v1',
    responseHash: 'sha256:v1:official-fixture-hash',
  };
  const policy: ProductReaderRuleLookupV1 = {
    status: 'approved',
    rule: {
      kind: 'standard_all_readers', productId: PRODUCT,
      productSpecVersion: 'synthetic-standard-v1', sajuDomain: domain,
      ruleVersion: 'synthetic-standard-rule', approvedPolicyRevision: 'synthetic-policy-r1',
    },
  };
  const productAuthorityPort = { readApprovedRule: vi.fn(async () => policy) };
  const input = {
    resolvedSubjectId: SUBJECT, threadId: THREAD, readingId: READING, effectiveAt: EFFECTIVE,
    contentEntry: {
      release: { releaseId: RELEASE, bundleId: BUNDLE },
      characters: { characters: [{ characterId: reader }] },
    } as unknown as ContentReleaseRuntimeEntry,
    threadBindingAuthorityPort: { readRuntimeBinding: vi.fn(async () => [{
      threadId: THREAD, status: 'active', activeContentReleaseId: RELEASE,
      activeContentBundleId: BUNDLE, contentRevision: 2,
      participantCharacterIds: [reader],
    }]) },
    accessAuthorityPort: { readAccessibleReadings: vi.fn(async () => [access]) },
    artifactAuthorityPort: { readArtifactSource: vi.fn(async () => [{
      readingId: READING, productId: PRODUCT, readerCharacterId: reader,
      readingContractVersion: access.readingContractVersion,
      productResponseState: 'delivered',
      responseSnapshotJsonb: {
        responseVersion: access.readingContractVersion, state: 'delivered',
        reading: {
          readingId: READING,
          sections: [{ sectionType: 'overview', title: '공식', blocks: [
            { type: 'paragraph', text: '근거를 바탕으로 설명합니다.' },
          ] }],
          disclosures: [{ type: 'notice', text: '불확실성을 고려해야 합니다.' }],
          calculationSummary: {},
        },
      },
      responseHash: access.responseHash,
      completedAt: '2026-10-09T07:30:00.000Z',
    }]) },
    productReaderEligibilityAuthorityPort: productAuthorityPort,
  };
  const speech = {
    register: 'respectful', sentenceRhythm: 'short', directness: 'medium',
    warmth: 'medium', profanity: 'none', forbiddenBehaviors: [],
  };
  const communication = {
    register: 'respectful', sentenceRhythm: 'short', verbosity: 'medium',
    humorStyle: 'none', metaphorStyle: 'none', profanityIntensity: 'none',
    politenessStyle: 'respectful',
  };
  const baseContext = {
    schemaVersion: 'v1', characterId: reader, contentBundleId: BUNDLE,
    contentVersion: 'fixture-content-v1', speech, persona: { communication },
    sajuProfile: { profileVersion: 'fixture-saju-profile-v1' },
    saju: null, lifeFacts: [], memories: [], recentMessages: [],
  } as unknown as CharacterRuntimeContextV1;
  const perspective = {
    characterId: reader, sourceContentVersion: baseContext.contentVersion,
    sourceSajuProfileVersion: 'fixture-saju-profile-v1',
    perspectiveVersion: 'fixture-perspective-v1',
    attentionOrder: ['work'], preferredNarrativeRoles: ['primary'],
    selection: { maxPrimaryUnits: 1, maxSupportingUnits: 0, maxTensionUnits: 0,
      maxLimitationUnits: 0, avoidSameAxisRepetition: true },
  } as unknown as CharacterPerspectiveProfileV1;
  return { input, baseContext, perspective, productAuthorityPort };
}

function bundle(domain: SajuDomain) {
  const unit = {
    unitId: `grounding_unit_${'1'.repeat(24)}`,
    domain, axis: 'work', narrativeRole: 'primary',
    semanticKey: 'fixture-meaning-v1',
    canonicalMeaning: '공식 결과에 근거한 의미만 사용합니다.',
    sourceBlockRefs: ['sections.0.blocks.0'],
    requiredCompanionUnitRefs: [], requiredDisclosureRefs: [],
    realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
  };
  const material = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: READING,
    productResponseVersion: 'myeonghwa-product-reading-response-v2',
    engineVersion: 'saju-engine-v1', readingDomain: domain,
    sourceResponseHash: 'a'.repeat(64), units: [unit],
    disclosures: [], ambiguities: [],
  };
  return { ...material, groundingHash: hashCharacterSajuGroundingBundleMaterialV1(material) };
}

async function authorize(reader: string, domain: SajuDomain) {
  const f = fixture(reader, domain);
  const prepared = await prepareOfficialReadingReaderAdmissionV1(f.input);
  const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
    prepared, currentScope: prepared.scope,
    productAuthorityPort: f.productAuthorityPort,
  });
  const context = assembleOfficialStandardReaderRuntimeV2({
    proof, currentScope: prepared.scope,
    source: prepared.source, baseContext: f.baseContext,
  });
  return { ...f, prepared, proof, context };
}

describe('A3-beta: verified official standard Saju runtime, no fake Capability', () => {
  it.each(readers.flatMap((reader) => SAJU_DOMAINS.map((domain) => [reader, domain] as const)))(
    'admits exact %s / %s with a genuine A2/A3 proof and source grounding',
    async (reader, domain) => {
      const a = await authorize(reader, domain);
      expect(a.context.saju.eligibility).toMatchObject({
        source: 'official_standard_product_rule',
        admittedDomain: domain, readerCharacterId: reader, readingRef: READING,
      });
      expect('capability' in a.context.saju).toBe(false);
      expect(a.context.saju.protectedSegments[0]?.text).toBe('근거를 바탕으로 설명합니다.');
      expect(a.context.saju.disclosures[0]?.text).toBe('불확실성을 고려해야 합니다.');
      const grounding = bundle(domain);
      const admitted = admitCharacterRuntimeSajuGroundingV2({
        context: a.context, groundingRef: grounding,
      });
      const selected = selectCharacterInsightsV2({
        context: admitted, grounding, perspective: a.perspective,
        requestedDomain: domain,
      });
      expect(selected.selectedUnitIds).toEqual([grounding.units[0]!.unitId]);
      expect(Object.isFrozen(admitted)).toBe(true);
    },
  );

  it('blocks forged, cloned, reused and scope-swapped proofs', async () => {
    const a = await authorize('seyeon', 'general');
    expect(() => assembleOfficialStandardReaderRuntimeV2({
      proof: a.proof, currentScope: a.prepared.scope,
      source: a.prepared.source, baseContext: a.baseContext,
    })).toThrow();
    const b = fixture('seyeon', 'general');
    const prepared = await prepareOfficialReadingReaderAdmissionV1(b.input);
    const proof = await issueCharacterSajuOfficialStandardEligibilityV2({
      prepared, currentScope: prepared.scope, productAuthorityPort: b.productAuthorityPort,
    });
    expect(() => assembleOfficialStandardReaderRuntimeV2({
      proof: { ...proof }, currentScope: prepared.scope,
      source: prepared.source, baseContext: b.baseContext,
    })).toThrow();
    expect(() => assembleOfficialStandardReaderRuntimeV2({
      proof, currentScope: { ...prepared.scope, contentReleaseId: 'revoked-release' },
      source: prepared.source, baseContext: b.baseContext,
    })).toThrow();
  });

  it('rejects wrong Reader, reading hash drift and caller-cloned grounded context', async () => {
    const a = await authorize('baekheon', 'wealth');
    const grounding = bundle('wealth');
    expect(() => admitCharacterRuntimeSajuGroundingV2({
      context: a.context, groundingRef: { ...grounding, readingDomain: 'general' },
    })).toThrow();
    const admitted = admitCharacterRuntimeSajuGroundingV2({
      context: a.context, groundingRef: grounding,
    });
    expect(() => selectCharacterInsightsV2({
      context: { ...admitted }, grounding,
      perspective: a.perspective, requestedDomain: 'wealth',
    })).toThrow(CharacterSajuRuntimeAdmissionErrorV2);
    expect(() => selectCharacterInsightsV2({
      context: admitted, grounding: { ...grounding, groundingHash: 'b'.repeat(64) },
      perspective: a.perspective, requestedDomain: 'wealth',
    })).toThrow();
    expect(() => selectCharacterInsightsV2({
      context: admitted, grounding,
      perspective: a.perspective, requestedDomain: 'general',
    })).toThrow(CharacterSajuRuntimeAdmissionErrorV2);
  });

  it('leaves legacy V1 capability-domain denial intact', () => {
    const grounding = bundle('general');
    const legacy = {
      characterId: 'seyeon', contentVersion: 'fixture-content-v1',
      sajuProfile: { profileVersion: 'fixture-saju-profile-v1' },
      saju: {
        domain: 'general', capability: { domain: 'wealth' },
        groundingRef: grounding,
      },
    } as unknown as CharacterRuntimeContextWithGroundingV1;
    expect(() => selectCharacterInsightsV1({
      context: legacy, grounding,
      perspective: fixture('seyeon', 'general').perspective,
      requestedDomain: 'general',
    })).toThrow(/capability/i);
  });
});
