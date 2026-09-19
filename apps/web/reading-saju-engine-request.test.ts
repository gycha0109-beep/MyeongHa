import { describe, expect, it } from 'vitest';
import { resolveReadingDetailRoute } from './reading-detail-route.js';
import {
  SAJU_CONSUMER_READING_ADAPTER_VERSION,
  resolveSajuButtonEngineRequest,
} from './reading-saju-engine-request.js';

function resolve(search: string, context = {}) {
  return resolveSajuButtonEngineRequest(resolveReadingDetailRoute(search), context);
}

describe('Saju hub button -> engine request projection', () => {
  it.each([
    ['?topic=temperament&scope=original', 'general', '전체 사주'],
    ['?topic=career', 'career', '직업운'],
    ['?topic=money', 'wealth', '재물운'],
    ['?topic=love', 'relationship', '연애운'],
    ['?topic=business', 'business', '사업운'],
    ['?topic=life-stage', 'life_stage', '인생 흐름'],
    ['?scope=year', 'general', '올해 운세'],
    ['?scope=month', 'general', '이번 달 운세'],
    ['?topic=spouse', 'relationship', '배우자운'],
    ['?topic=career&scope=year', 'career', '올해 직업운'],
    ['?topic=money&scope=month', 'wealth', '이번 달 재물운'],
    ['?topic=business&scope=year', 'business', '올해 사업운'],
  ])('projects %s to the frozen Saju grammar', (search, domain, readingText) => {
    expect(resolve(search)).toEqual({
      state: 'ready',
      domain,
      readingText,
      adapterVersion: SAJU_CONSUMER_READING_ADAPTER_VERSION,
      mappingVersion: 'myeongha-saju-button-request-v1',
    });
  });

  it('does not invent a generic family semantic intent', () => {
    expect(resolve('?topic=family')).toMatchObject({
      state: 'requires_input',
      domain: 'family',
      input: 'family_scope',
    });
    expect(resolve('?topic=family', { familyScope: 'parents' })).toMatchObject({
      state: 'ready',
      domain: 'family',
      readingText: '부모운',
    });
    expect(resolve('?topic=family', { familyScope: 'children' })).toMatchObject({
      state: 'ready',
      domain: 'family',
      readingText: '자녀운',
    });
  });

  it('requires an explicit target before producing a compatibility request', () => {
    expect(resolve('?topic=compatibility')).toMatchObject({
      state: 'requires_input',
      domain: 'compatibility',
      input: 'target_person',
    });
    expect(resolve('?topic=compatibility', { targetPersonRef: 'target-person-01' })).toMatchObject({
      state: 'ready',
      domain: 'compatibility',
      readingText: '궁합',
      targetPersonRef: 'target-person-01',
    });
  });

  it('requires the actual user question for question-specific reading', () => {
    expect(resolve('?topic=question-specific')).toMatchObject({
      state: 'requires_input',
      domain: 'question_specific',
      input: 'question',
    });
    expect(resolve('?topic=question-specific', { question: '이직해도 될까요?' })).toMatchObject({
      state: 'ready',
      domain: 'question_specific',
      readingText: '질문: 이직해도 될까요?',
    });
  });

  it('fails closed for unsupported route identity instead of falling back to general', () => {
    expect(resolve('?topic=not-a-reading')).toEqual({
      state: 'invalid',
      reason: 'invalid_product_route',
    });
  });

  it('keeps ProductHost reading.text inside the current 200-character boundary', () => {
    const longQuestion = '가'.repeat(197);
    expect(resolve('?topic=question-specific', { question: longQuestion })).toEqual({
      state: 'invalid',
      reason: 'reading_text_out_of_bounds',
    });
  });
});
