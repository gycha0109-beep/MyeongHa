import { describe, expect, it } from 'vitest';
import { readingStepSourceCategoriesV1 } from './reading-step-source-categories.js';

describe('Saju official Reading source category projection', () => {
  const readingStep = Object.freeze({
    structure: Object.freeze(['발행된 근거 A', '발행된 근거 B']),
    supporting: Object.freeze(['추가 해석 A', '추가 해석 B']),
  });

  it('keeps official supplementary interpretation out of the evidence block', () => {
    const shown = readingStepSourceCategoriesV1(readingStep, true);
    expect(shown.structure).toEqual(['발행된 근거 A', '발행된 근거 B']);
    expect(shown.supporting).toEqual(['추가 해석 A', '추가 해석 B']);
    expect(shown.structure).not.toContain('추가 해석 A');
  });

  it('withholds empty official evidence instead of promoting supplementary prose', () => {
    const shown = readingStepSourceCategoriesV1({
      structure: [], supporting: ['보조 해석'],
    }, true);
    expect(shown.structure).toEqual([]);
    expect(shown.supporting).toEqual(['보조 해석']);
  });

  it('preserves the current Preview secondary display separately from official records', () => {
    const shown = readingStepSourceCategoriesV1(readingStep, false);
    expect(shown.structure).toEqual([
      '발행된 근거 A', '발행된 근거 B', '추가 해석 A', '추가 해석 B',
    ]);
    expect(shown.supporting).toEqual([]);
  });

  it('does not mutate the source or allow a projected category to be rewritten', () => {
    const shown = readingStepSourceCategoriesV1(readingStep, true);
    expect(Object.isFrozen(shown)).toBe(true);
    expect(Object.isFrozen(shown.structure)).toBe(true);
    expect(Object.isFrozen(shown.supporting)).toBe(true);
    expect(readingStep.structure).toEqual(['발행된 근거 A', '발행된 근거 B']);
    expect(readingStep.supporting).toEqual(['추가 해석 A', '추가 해석 B']);
  });
});