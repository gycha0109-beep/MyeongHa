import { describe, expect, it } from 'vitest';
import {
  resolveCharacterFactAuthorityEntryV1,
  RAHYEON_FACT_AUTHORITY_REGISTRY_V1,
} from '../../character-content/src/index.js';
import { evaluateCharacterDisclosurePreflightV2 } from './character-disclosure-gate-v2.js';
import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';
import { composeRahyeonTurnContextV1 } from './rahyeon-runtime-turn-context-v1.js';

function context(
  characterId = 'rahyeon',
  events: readonly ('CONFLICT_EVENT' | 'RECONCILIATION_EVENT')[] = [],
  saju: CharacterRuntimeContextV1['saju'] = null,
): CharacterRuntimeContextV1 {
  // Only fields consumed by the typed projection are needed for this unit test.
  return {
    characterId,
    saju,
    speech: { register: '여유롭고 직접적인 성숙한 존댓말' },
    relationship: { recentEventKeys: events, stageKey: 'familiar', trustBand: 'medium' },
  } as unknown as CharacterRuntimeContextV1;
}

const romance = resolveCharacterFactAuthorityEntryV1(
  RAHYEON_FACT_AUTHORITY_REGISTRY_V1, 'past_romance.existence',
);
if (romance === null) throw new Error('Canon romance fact is required for the fixture');

function romanceDecision(gate: 'PUBLIC' | 'FAMILIAR') {
  return evaluateCharacterDisclosurePreflightV2({
    characterId: 'rahyeon',
    topicKey: 'past_romance_surface',
    source: {
      topicKey: 'past_romance_surface',
      factKey: 'past_romance.existence',
      sourceRef: 'bible://rahyeon/J4',
      allowedDepth: 'surface',
      previouslyDisclosedDepth: 'none',
    },
    factAuthority: romance,
    relationship: {
      gate,
      trustBand: gate === 'PUBLIC' ? 'low' : 'medium',
      relevantSharedHistoryRefs: gate === 'PUBLIC' ? [] : ['turn-confirmed-relationship'],
    },
    questionContext: 'direct',
  });
}

describe('Rahyeon typed Runtime v0.2 governed context bridge', () => {
  it('projects only requested public facts and never full Bible or romance automatically', () => {
    const result = composeRahyeonTurnContextV1(context(), {
      kind: 'biography',
      requestedFactKeys: [
        'identity.exact_age', 'identity.birthday',
        'past_romance.existence', 'family.structure', 'life.exact_address',
      ],
    });
    expect(result.characterId).toBe('rahyeon');
    expect(result.runtimeAuthorityVersion).toMatch(/^sha256:v1:[0-9a-f]{64}$/u);
    expect(result.authorizedPublicFacts).toEqual([
      { factKey: 'identity.exact_age', value: '31세' },
      { factKey: 'identity.birthday', value: '11월 7일' },
    ]);
    expect(result.privateDisclosure.result).toBe('NOT_REQUESTED');
    expect(result.privateDisclosure.retrievedSources).toEqual([]);
  });

  it('keeps private romance unavailable at PUBLIC trust even when the fact is Canon', () => {
    const decision = romanceDecision('PUBLIC');
    expect(decision.retrievalScope.depth).toBe('none');
    expect(decision.result).toBe('BOUNDARY');
    expect(composeRahyeonTurnContextV1(context(), {
      kind: 'romance', requestedFactKeys: ['past_romance.existence'], disclosureDecision: decision,
    }).privateDisclosure.retrievedSources).toEqual([]);
    expect(() => composeRahyeonTurnContextV1(context(), {
      kind: 'romance',
      requestedFactKeys: ['past_romance.existence'],
      disclosureDecision: decision,
      retrievedPrivateSources: [{
        topicKey: 'past_romance_surface', factKey: 'past_romance.existence',
        depth: 'surface', sourceRef: 'bible://rahyeon/J4', content: '진지한 연애 두 번',
      }],
    })).toThrow(/Disclosure-blocked private content/);
  });

  it('admits an authorized partial surface only after disclosure preflight', () => {
    const decision = romanceDecision('FAMILIAR');
    expect(['ALLOW', 'PARTIAL']).toContain(decision.result);
    const result = composeRahyeonTurnContextV1(context(), {
      kind: 'romance',
      requestedFactKeys: ['past_romance.existence'],
      disclosureDecision: decision,
      retrievedPrivateSources: [{
        topicKey: 'past_romance_surface', factKey: 'past_romance.existence',
        depth: 'surface', sourceRef: 'bible://rahyeon/J4',
        content: '진지한 연애는 두 번이고 지금은 솔로다',
      }],
    });
    expect(result.privateDisclosure.retrievedSources).toHaveLength(1);
    expect(result.authorizedPublicFacts).toEqual([]);
  });

  it('rejects forged identity, unknown facts, unapproved private data and invalid Saju', () => {
    expect(() => composeRahyeonTurnContextV1(context('seyeon'), {
      kind: 'ordinary', requestedFactKeys: [],
    })).toThrow(/different Character/);
    expect(() => composeRahyeonTurnContextV1(context(), {
      kind: 'ordinary', requestedFactKeys: ['family.imaginary_name'],
    })).toThrow(/Unknown Rahyeon fact/);
    expect(() => composeRahyeonTurnContextV1(context(), {
      kind: 'romance', requestedFactKeys: ['past_romance.existence'],
      retrievedPrivateSources: [{
        topicKey: 'past_romance_surface', factKey: 'past_romance.existence',
        depth: 'surface', sourceRef: 'bible://rahyeon/J4', content: '비공개 정보',
      }],
    })).toThrow(/requires an authorized disclosure/);
    expect(() => composeRahyeonTurnContextV1(context(), {
      kind: 'ordinary', requestedFactKeys: ['identity.exact_age', 'identity.exact_age'],
    })).toThrow(/bounded and unique/);
    expect(() => composeRahyeonTurnContextV1(context(), {
      kind: 'saju', requestedFactKeys: [],
    })).toThrow(/independently admitted/);
  });

  it('honors relationship friction and reconciliation without mutating the projection', () => {
    const first = context('rahyeon', ['CONFLICT_EVENT']);
    const before = first.relationship;
    expect(composeRahyeonTurnContextV1(first, {
      kind: 'ordinary', requestedFactKeys: [],
    }).actionHint).toBe('direct_boundary');
    expect(composeRahyeonTurnContextV1(context('rahyeon', [
      'CONFLICT_EVENT', 'RECONCILIATION_EVENT',
    ]), {
      kind: 'ordinary', requestedFactKeys: [],
    }).actionHint).toBe('repair_before_flirt');
    expect(first.relationship).toBe(before);
  });

  it('never adds fantasy or relationship interrogation to a mundane turn', () => {
    const result = composeRahyeonTurnContextV1(context(), {
      kind: 'ordinary', requestedFactKeys: [],
    });
    expect(result.bibleSliceIds).toEqual(['B2', 'D', 'E1']);
    expect(result.actionHint).toBe('ordinary_reply');
    expect(result.authorizedPublicFacts).toEqual([]);
  });
});
