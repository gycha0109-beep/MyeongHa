import { describe, expect, it } from 'vitest';

import {
  RELATIONSHIP_EVENT_CANDIDATES,
  SAJU_DOMAINS,
} from '../../contracts/src/index.js';
import type { CharacterRelationshipBehaviorContent } from './schema.js';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS,
  CHARACTER_RUNTIME_AVOIDED_STRATEGY_KEYS_V1,
  CHARACTER_RUNTIME_BEHAVIOR_TRIGGER_KEYS_V1,
  CHARACTER_RUNTIME_QUESTION_STRATEGY_KEYS_V1,
  canCharacterInitiateSajuDomainEffective,
} from './runtime-authoring-v1.js';

const expectedCanonicalIds = [
  'seyeon',
  'yeoul',
  'seorin',
  'rahyeon',
  'mira',
  'taegyeom',
  'yunho',
  'doyun',
  'baekheon',
] as const;

const expectedDisplayNames = [
  '세연',
  '여울',
  '서린',
  '라현',
  '미라',
  '태겸',
  '윤호',
  '도윤',
  '백헌',
] as const;

const forbiddenBehaviors = [
  'alter_saju_semantics',
  'invent_current_life_fact',
  'mutate_relationship_directly',
  'invent_world_canon',
] as const;

describe('Character runtime authoring v1 authority', () => {
  it('binds the approved runtime values to the exact #551 canonical IDs', () => {
    expect(CHARACTER_RUNTIME_AUTHORING_V1_CHARACTER_IDS).toEqual(expectedCanonicalIds);
    expect(CHARACTER_RUNTIME_AUTHORING_V1.map((character) => character.characterId)).toEqual(
      expectedCanonicalIds,
    );
    expect(new Set(CHARACTER_RUNTIME_AUTHORING_V1.map((character) => character.characterId)).size).toBe(9);
    expect(
      CHARACTER_RUNTIME_AUTHORING_V1.every(
        (character) => !character.characterId.startsWith('myeongha.'),
      ),
    ).toBe(true);
  });

  it('covers all nine approved launch display names with every approved runtime component', () => {
    expect(CHARACTER_RUNTIME_AUTHORING_V1).toHaveLength(9);
    expect(CHARACTER_RUNTIME_AUTHORING_V1.map((character) => character.displayName)).toEqual(
      expectedDisplayNames,
    );

    for (const character of CHARACTER_RUNTIME_AUTHORING_V1) {
      expect(character.speech.forbiddenBehaviors).toEqual(forbiddenBehaviors);
      expect(character.persona).toBeDefined();
      expect(character.behavior).toBeDefined();
      expect(character.sajuProfile).toBeDefined();
      expect(character.sajuProfile.safeFraming.before).toHaveLength(2);
      expect(character.sajuProfile.safeFraming.after).toHaveLength(2);
      expect(character.relationshipBehavior).toBeDefined();
    }
  });

  it('aligns Seyeon, Yeoul, and Rahyeon typed runtime projections with the reviewed Runtime instances', () => {
    const seyeon = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (character) => character.characterId === 'seyeon',
    );
    const yeoul = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (character) => character.characterId === 'yeoul',
    );
    const rahyeon = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (character) => character.characterId === 'rahyeon',
    );

    expect(seyeon?.speech.register).toBe('밝고 행동적인 현실형 동행자');
    expect(seyeon?.behavior.questionPriorities).toEqual([
      'activate_next_step',
      'clarify_boundary',
    ]);
    expect(seyeon?.relationshipBehavior.defaultMode.distance).toBe('warm-proactive');

    expect(yeoul?.speech.register).toBe(
      '새침하지만 감정이 행동으로 먼저 새는 관계형 동행자',
    );
    expect(yeoul?.behavior.questionPriorities).toEqual([
      'ask_emotional_signal',
      'ask_evidence_gap',
    ]);
    expect(yeoul?.relationshipBehavior.defaultMode.distance).toBe('slightly-prickly');

    expect(rahyeon?.speech.register).toBe('자기 확신과 여유가 있는 성숙한 주도형');
    expect(rahyeon?.behavior.questionPriorities).toEqual([
      'surface_tradeoff',
      'ask_decision_constraint',
    ]);
    expect(rahyeon?.relationshipBehavior.defaultMode.distance).toBe('composed');

    const reviewedRuntimeProjection = JSON.stringify([seyeon, yeoul, rahyeon]);
    expect(reviewedRuntimeProjection).not.toContain('차분하고 균형 잡힌 검토자');
    expect(reviewedRuntimeProjection).not.toContain('부드럽고 감각적인 정서 관찰자');
    expect(reviewedRuntimeProjection).not.toContain('밝고 빠른 사회적 촉진자');
  });

  it('keeps unresolved Principle/Calling authority out of Runtime authoring', () => {
    for (const characterId of ['seyeon', 'yeoul', 'rahyeon'] as const) {
      const character = CHARACTER_RUNTIME_AUTHORING_V1.find(
        (entry) => entry.characterId === characterId,
      );

      expect(character).toBeDefined();
      expect('principleId' in (character ?? {})).toBe(false);
      expect('callingBond' in (character ?? {})).toBe(false);
      expect('representativeTitle' in (character ?? {})).toBe(false);
      expect('oath' in (character ?? {})).toBe(false);
    }
  });

  it('keeps publication-only fields outside the runtime authoring registry', () => {
    for (const character of CHARACTER_RUNTIME_AUTHORING_V1) {
      expect('assetRefs' in character).toBe(false);
      expect('emotionIds' in character).toBe(false);
      expect('animationCueIds' in character).toBe(false);
      expect('assetManifestHash' in character).toBe(false);
      expect('bundleId' in character).toBe(false);
      expect('releaseId' in character).toBe(false);
    }
  });

  it('covers every Saju domain exactly once per Character and only primary roles carry authored canInitiate', () => {
    const expectedDomains = [...SAJU_DOMAINS].sort();

    for (const character of CHARACTER_RUNTIME_AUTHORING_V1) {
      const actualDomains = character.capabilities.map((entry) => entry.domain).sort();
      expect(actualDomains).toEqual(expectedDomains);
      expect(new Set(actualDomains).size).toBe(SAJU_DOMAINS.length);
      expect(
        character.capabilities.every(
          (entry) => entry.canInitiate === (entry.role === 'primary'),
        ),
      ).toBe(true);
    }
  });

  it('uses only the PO-approved question, avoided-strategy, behavior-trigger, event, and band vocabularies', () => {
    const questionKeys = new Set<string>(CHARACTER_RUNTIME_QUESTION_STRATEGY_KEYS_V1);
    const avoidedKeys = new Set<string>(CHARACTER_RUNTIME_AVOIDED_STRATEGY_KEYS_V1);
    const triggerKeys = new Set<string>(CHARACTER_RUNTIME_BEHAVIOR_TRIGGER_KEYS_V1);
    const relationshipEvents = new Set<string>(RELATIONSHIP_EVENT_CANDIDATES);

    for (const character of CHARACTER_RUNTIME_AUTHORING_V1) {
      expect(
        character.persona.questioning.preferredStrategies.every((key) => questionKeys.has(key)),
      ).toBe(true);
      expect(
        character.persona.questioning.avoidedStrategies.every((key) => avoidedKeys.has(key)),
      ).toBe(true);
      expect(character.behavior.rules.every((rule) => triggerKeys.has(rule.triggerKey))).toBe(true);

      for (const rule of character.relationshipBehavior.rules) {
        const when: CharacterRelationshipBehaviorContent['rules'][number]['when'] = rule.when;
        expect(Object.prototype.hasOwnProperty.call(when, 'stageKeys')).toBe(false);
        expect(
          when.recentEventKeys?.every((eventKey) => relationshipEvents.has(eventKey)) ?? true,
        ).toBe(true);
        expect(
          [when.trustBands, when.closenessBands, when.frictionBands]
            .filter((bands): bands is readonly ('low' | 'medium' | 'high')[] => bands !== undefined)
            .flat()
            .every((band) => ['low', 'medium', 'high'].includes(band)),
        ).toBe(true);
      }
    }
  });

  it('fails closed when upstream Saju authority is blocked even for authored primary capabilities', () => {
    const seyeon = CHARACTER_RUNTIME_AUTHORING_V1.find(
      (character) => character.characterId === 'seyeon',
    );
    const general = seyeon?.capabilities.find((entry) => entry.domain === 'general');
    const family = seyeon?.capabilities.find((entry) => entry.domain === 'family');

    expect(general?.role).toBe('primary');
    expect(general?.canInitiate).toBe(true);
    expect(family?.role).toBe('secondary');
    expect(family?.canInitiate).toBe(false);

    if (general === undefined || family === undefined) {
      throw new Error('expected canonical seyeon capabilities');
    }

    expect(
      canCharacterInitiateSajuDomainEffective(general, {
        upstreamDomainProductionAuthorized: false,
        requiredMethodologyRulePackAuthorized: true,
        productReleaseEntitlementAllowsExecution: true,
      }),
    ).toBe(false);

    expect(
      canCharacterInitiateSajuDomainEffective(general, {
        upstreamDomainProductionAuthorized: true,
        requiredMethodologyRulePackAuthorized: false,
        productReleaseEntitlementAllowsExecution: true,
      }),
    ).toBe(false);

    expect(
      canCharacterInitiateSajuDomainEffective(general, {
        upstreamDomainProductionAuthorized: true,
        requiredMethodologyRulePackAuthorized: true,
        productReleaseEntitlementAllowsExecution: false,
      }),
    ).toBe(false);

    expect(
      canCharacterInitiateSajuDomainEffective(general, {
        upstreamDomainProductionAuthorized: true,
        requiredMethodologyRulePackAuthorized: true,
        productReleaseEntitlementAllowsExecution: true,
      }),
    ).toBe(true);

    expect(
      canCharacterInitiateSajuDomainEffective(family, {
        upstreamDomainProductionAuthorized: true,
        requiredMethodologyRulePackAuthorized: true,
        productReleaseEntitlementAllowsExecution: true,
      }),
    ).toBe(false);
  });
});
