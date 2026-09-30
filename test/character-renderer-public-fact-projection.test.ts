import { describe, expect, it } from 'vitest';

import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  assembleCharacterRuntimeContext,
  projectCharacterRuntimeContextForRendererV1,
  type CharacterRuntimeContextV1,
} from '../packages/domain/src/index.js';
import {
  attachServerAuthorizedCharacterPublicFactsV1,
} from '../packages/domain/src/character-runtime-context.js';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
} from '../packages/character-content/src/runtime-authoring-v1.js';

function authoredCharacter(): CharacterContentDefinition {
  const runtime = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (entry) => entry.characterId === 'seyeon',
  );
  if (runtime === undefined) throw new Error('Missing Seyeon runtime authoring fixture.');

  return {
    characterId: 'seyeon',
    contentVersion: 'renderer-public-fact-test-v1',
    displayName: runtime.displayName,
    representativeTitle: 'renderer_public_fact_test',
    shortDescriptor: 'renderer public fact projection test only',
    personalityTraits: ['observant'],
    flaws: ['overchecks boundaries'],
    values: ['truth'],
    speech: runtime.speech,
    capabilities: runtime.capabilities,
    assetRefs: [],
    emotionIds: ['neutral'],
    animationCueIds: ['idle'],
    canon: {
      worldRole: 'test representative',
      origin: 'test fixture',
      apparentAgeBand: 'adult',
      callingBond: {
        authorityState: 'world_dependent',
        note: 'Principle/Calling intentionally unresolved.',
      },
      worldview: {
        coreValues: ['truth'],
        humanTheory: 'People retain agency.',
        agencyTheory: 'People choose for themselves.',
        truthTheory: 'Claims require provenance.',
      },
      psychology: {
        desire: 'Help without replacing choice.',
        fear: 'Overstepping authority.',
        flaw: 'Overchecks boundaries.',
        contradiction: 'Acts quickly but guards authority.',
        hiddenMotivation: 'Keep the interaction grounded.',
      },
    },
    persona: runtime.persona,
    behavior: runtime.behavior,
    sajuProfile: runtime.sajuProfile,
    relationshipBehavior: runtime.relationshipBehavior,
  };
}

function runtimeContext() {
  const character = authoredCharacter();
  const base = assembleCharacterRuntimeContext({
    character,
    contentBundleId: 'bundle-renderer-public-fact-test',
    relationshipState: {
      closeness: 0,
      trust: 0,
      friction: 0,
      stage: 'source-unresolved-stage',
      revision: 1,
      policyVersion: 'relationship-policy-test',
    },
    recentRelationshipEventKeys: [],
    relationshipProjectionPolicy: {
      version: 'relationship-render-test',
      closeness: { lowMax: 20, mediumMax: 60 },
      trust: { lowMax: 20, mediumMax: 60 },
      friction: { lowMax: 20, mediumMax: 60 },
    },
    worldRelations: [],
    grantedLifeFacts: [],
    grantedMemories: [],
    recentMessages: [],
  });

  return attachServerAuthorizedCharacterPublicFactsV1(base, [
    {
      characterId: 'seyeon',
      factKey: 'identity.birthday',
      sourceAuthority: 'CANON',
      value: '3월 18일',
      sourceReleaseId: 'release-sensitive-provenance-test',
      sourceSection: 'B1',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'private-source-revision-test',
    },
    {
      characterId: 'seyeon',
      factKey: 'identity.mbti_self_report',
      sourceAuthority: 'SOFT_CANON',
      value: '과거 검사 ESFP / 현재 큰 관심 없음',
      sourceReleaseId: 'release-sensitive-provenance-test',
      sourceSection: 'B1',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'private-source-revision-test',
    },
  ]);
}

describe('Character renderer context projection', () => {
  it('keeps admitted public values while removing release and Bible provenance from provider input', () => {
    const source = runtimeContext();
    const projected = projectCharacterRuntimeContextForRendererV1(source);

    expect(projected.publicCharacterFacts).toEqual([
      {
        factKey: 'identity.birthday',
        sourceAuthority: 'CANON',
        value: '3월 18일',
      },
      {
        factKey: 'identity.mbti_self_report',
        sourceAuthority: 'SOFT_CANON',
        value: '과거 검사 ESFP / 현재 큰 관심 없음',
      },
    ]);

    const serialized = JSON.stringify(projected.publicCharacterFacts);
    expect(serialized).not.toContain('release-sensitive-provenance-test');
    expect(serialized).not.toContain('SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md');
    expect(serialized).not.toContain('private-source-revision-test');

    expect(source.publicCharacterFacts[0]).toMatchObject({
      sourceReleaseId: 'release-sensitive-provenance-test',
      sourceBibleDocument: 'SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',
      sourceBibleRevision: 'private-source-revision-test',
    });
  });

  it('does not mutate the server-owned runtime context', () => {
    const source = runtimeContext();
    const projected = projectCharacterRuntimeContextForRendererV1(source);

    expect(projected).not.toBe(source);
    expect(source.publicCharacterFacts[0]).toHaveProperty('sourceReleaseId');
    expect(projected.publicCharacterFacts[0]).not.toHaveProperty('sourceReleaseId');
  });

  it('strips protected Saju semantics and Reading identity from provider input', () => {
    const source = runtimeContext();
    const sajuSource = Object.freeze({
      ...source,
      saju: Object.freeze({
        readingRef: 'reading-secret-ref',
        domain: 'general',
        coverageState: 'complete',
        protectedSegments: Object.freeze([Object.freeze({
          segmentId: 'secret-segment',
          sourceReadingRef: 'reading-secret-ref',
          sourceRef: 'secret-source-ref',
          contentHash: 'sha256:v1:secret-hash',
          text: '서버만 보유해야 하는 사주 본문',
        })]),
        disclosures: Object.freeze([Object.freeze({
          segmentId: 'secret-disclosure',
          sourceReadingRef: 'reading-secret-ref',
          sourceRef: 'secret-disclosure-ref',
          contentHash: 'sha256:v1:secret-disclosure-hash',
          text: '서버만 보유해야 하는 고지 본문',
        })]),
        ambiguity: Object.freeze(['민감한 계산 애매성 원문']),
        capability: authoredCharacter().capabilities[0]!,
      }),
    }) as unknown as CharacterRuntimeContextV1;

    const projected = projectCharacterRuntimeContextForRendererV1(sajuSource);

    expect(projected.saju).toEqual({
      domain: 'general',
      coverageState: 'complete',
      hasProtectedSegments: true,
      hasDisclosures: true,
      hasAmbiguity: true,
      capability: authoredCharacter().capabilities[0]!,
    });

    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('reading-secret-ref');
    expect(serialized).not.toContain('secret-source-ref');
    expect(serialized).not.toContain('서버만 보유해야 하는 사주 본문');
    expect(serialized).not.toContain('서버만 보유해야 하는 고지 본문');
    expect(serialized).not.toContain('민감한 계산 애매성 원문');

    expect(sajuSource.saju?.protectedSegments[0]?.text).toBe(
      '서버만 보유해야 하는 사주 본문',
    );
  });

});
