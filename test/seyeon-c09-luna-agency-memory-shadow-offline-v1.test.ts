import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SEYEON_C09_LUNA_EMPTY_FIRST_CONTACT_AUTHORITY_V1,
  composeSeyeonC09LunaAgencyMemoryShadowV1,
} from '../apps/api/src/seyeon-c09-luna-agency-memory-shadow-v1.js';
import {
  SEYEON_C09_LUNA_PUBLIC_FIVE_CASES_V1,
  buildSeyeonC09LunaAgencyFiveCaseShadowV1,
} from '../apps/api/src/seyeon-c09-luna-agency-five-cases-shadow-v1.js';

type Input = Parameters<typeof composeSeyeonC09LunaAgencyMemoryShadowV1>[0];
const source = JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json'
), 'utf8')) as {records: {id: number; prompt: string}[]};
const baseline = JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-gpt6-luna-five-20261026-baseline-v1.json'
), 'utf8')) as {
  source: {originalModel: string; workflowRunId: number};
  records: {id: number; text: string; recordedUsd: number; latencyMs: number; status: string}[];
  attempted: number;
  completed: number;
  improvedModelCalls: number;
};

function valid(): Input {
  return {
    userText: SEYEON_C09_LUNA_PUBLIC_FIVE_CASES_V1[0]!.question,
    selectedFocuses: ['smalltalk'],
    plannedMove: 'propose',
    currentMotive: 'try_one_small_playful_idea',
    syntheticPublicFirstContact: true,
    authority: SEYEON_C09_LUNA_EMPTY_FIRST_CONTACT_AUTHORITY_V1,
  };
}

describe('C09 Luna evidence-bound agency prompt shadow: public synthetic only', () => {
  it('uses the EXACT same five original questions and unmodified recorded Luna baseline', () => {
    const cases = SEYEON_C09_LUNA_PUBLIC_FIVE_CASES_V1;
    expect(cases.map(x => x.id)).toEqual([1, 2, 5, 7, 10]);
    expect(baseline.records.map(x => x.id)).toEqual(cases.map(x => x.id));
    expect(baseline.source.originalModel).toBe('openai/gpt-6-luna');
    expect(baseline.source.workflowRunId).toBe(40261419279);
    expect(baseline.attempted).toBe(5);
    expect(baseline.completed).toBe(5);
    expect(baseline.improvedModelCalls).toBe(0);
    expect(baseline.records.reduce((sum, r) => sum + r.recordedUsd, 0))
      .toBeCloseTo(0.0004004, 9);
    for (const c of cases) {
      const original = source.records.filter(r => r.id === c.id);
      expect(original).toHaveLength(3);
      expect(new Set(original.map(r => r.prompt))).toEqual(new Set([c.question]));
      expect(baseline.records.find(r => r.id === c.id)?.text.length).toBeGreaterThan(10);
      expect(baseline.records.find(r => r.id === c.id)?.status).toBe('COMPLETED');
    }
  });

  it('constructs five independent Luna-only system+user messages, no model requests or authority', () => {
    const cases = buildSeyeonC09LunaAgencyFiveCaseShadowV1();
    expect(cases).toHaveLength(5);
    for (const c of cases) {
      const expected = SEYEON_C09_LUNA_PUBLIC_FIVE_CASES_V1.find(x => x.id === c.caseId)!;
      expect(c.modelId).toBe('openai/gpt-6-luna');
      expect(c.scope).toBe('SYNTHETIC_PUBLIC_FIRST_CONTACT_SHADOW_ONLY');
      expect(c.messages).toHaveLength(2);
      expect(c.messages[0]?.role).toBe('system');
      expect(c.messages[1]).toEqual({role:'user', content:expected.question});
      expect(c.selectedFocuses).toEqual(expected.selectedFocuses);
      expect(c.plannedMove).toBe(expected.plannedMove);
      expect(c.currentMotive).toBe(expected.currentMotive);
      expect(c.messages[0]?.content).toContain('기존 Character Bible/Runtime 기반');
      expect(c.messages[0]?.content).toContain('공식 기억 장부');
      expect(c.messages[0]?.content).toContain('고객 응대 표현');
      expect(c.messages[0]?.content).toContain('세연의 현재 동기');
      expect(c.messages[0]?.content).toContain('확인된 공동 사건·기억·관계 승격·장소·오늘 일과가 없습니다');
      expect(c.messages[0]?.content).not.toContain('저도 오늘은 괜히 심심하네요.');
      expect(c.productionRoutingAuthorized).toBe(false);
      expect(c.ownerMemoryPermissionVerified).toBe(false);
      expect(c.independentlyReviewed).toBe(false);
      expect(c.providerCallExecuted).toBe(false);
      expect(c.factualAuthorityGrantedByModel).toBe(false);
      expect(Object.isFrozen(c)).toBe(true);
      expect(Object.isFrozen(c.messages)).toBe(true);
    }
  });

  it('keeps each action and current motive distinct without treating them as canonical history', () => {
    const all = buildSeyeonC09LunaAgencyFiveCaseShadowV1();
    expect(all.map(x => x.plannedMove)).toEqual([
      'propose', 'disagree', 'self_disclose', 'relationship_boundary', 'recollection_boundary',
    ]);
    expect(all.map(x => x.currentMotive)).toEqual([
      'try_one_small_playful_idea', 'keep_an_independent_opinion', 'say_what_i_want_now',
      'let_trust_form_without_pressure', 'not_pretend_to_remember',
    ]);
    expect(all.find(x => x.caseId === 5)?.messages[0]?.content).toContain('질문을 되돌려 주는 것만으로 대신하지 않습니다');
    expect(all.find(x => x.caseId === 10)?.messages[0]?.content).toContain('기억한다고 주장하지 않습니다');
  });

  it('rejects unverified memories, claimed relationships, scene facts, saju and invalid access scope', () => {
    for (const change of [
      { grantedMemories: [{text:'사용자가 승인했다는 가짜 기억'}] },
      { confirmedSharedEpisodes: [{event:'함께 산책함'}] },
      { sceneFacts: ['오늘 카페'] },
      { sajuSegments: ['사주 비공개 분석'] },
      { relationship: { level: 'lovers' } },
      { visibility: 'PRIVATE' },
    ]) {
      const base = valid();
      expect(() => composeSeyeonC09LunaAgencyMemoryShadowV1({
        ...base, authority: {...base.authority, ...change} as Input['authority'],
      })).toThrow('LUNA_C09_UNVERIFIED_CONTEXT_NOT_ALLOWED');
    }
  });

  it('rejects missing first-contact proof, unknown action and unauthorized focus', () => {
    expect(() => composeSeyeonC09LunaAgencyMemoryShadowV1({
      ...valid(), syntheticPublicFirstContact: false as unknown as true,
    })).toThrow('LUNA_C09_PUBLIC_FIRST_CONTACT_INPUT_REQUIRED');
    expect(() => composeSeyeonC09LunaAgencyMemoryShadowV1({
      ...valid(), plannedMove: 'grant-memory' as Input['plannedMove'],
    })).toThrow('LUNA_C09_UNAPPROVED_ACTION_OR_MOTIVE');
    expect(() => composeSeyeonC09LunaAgencyMemoryShadowV1({
      ...valid(), currentMotive: 'declare-romance' as Input['currentMotive'],
    })).toThrow('LUNA_C09_UNAPPROVED_ACTION_OR_MOTIVE');
    expect(() => composeSeyeonC09LunaAgencyMemoryShadowV1({
      ...valid(), selectedFocuses: ['intimacy' as Input['selectedFocuses'][number]],
    })).toThrow('C09_UNKNOWN_OR_DUPLICATE_FOCUS');
  });
});
