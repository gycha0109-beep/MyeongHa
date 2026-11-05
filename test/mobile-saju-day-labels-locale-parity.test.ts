import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { mobileSajuDayNameV1, mobileSajuDayQualifiersV1 } from '../apps/mobile/src/features/saju/mobile-saju-day-labels.js';
import type { MobileSajuViewModelV1 } from '../apps/mobile/src/features/saju/saju-view-model.js';

const day: MobileSajuViewModelV1['dayMaster'] = Object.freeze({
  status: 'resolved', hanja: '丙', hangul: '병', element: '화', yinYang: '양',
});
const unresolved: MobileSajuViewModelV1['dayMaster'] = Object.freeze({
  status: 'unresolved', hanja: '—', hangul: '확정되지 않음', element: null, yinYang: null,
});

describe('Saju calculated Day Stem UI-language parity', () => {
  it('shows verified Day Stem and five-element/yin-yang facts using the selected locale', () => {
    const expected = [
      ['ko-KR', '병', '화 · 양'],
      ['ja-JP', 'ひのえ', '火 · 陽'],
      ['zh-TW', '丙', '火 · 陽'],
      ['en-US', '丙', 'Fire · Yang'],
      ['zh-CN', '丙', '火 · 阳'],
    ] as const;
    for (const [locale, stem, qualifiers] of expected) {
      expect(mobileSajuDayNameV1(day, locale)).toBe(stem);
      expect(mobileSajuDayQualifiersV1(day, locale)).toBe(qualifiers);
    }
  });

  it('never projects an unresolved pillar as resolved', () => {
    expect(mobileSajuDayNameV1(unresolved, 'ko-KR')).toBe('확정되지 않음');
    expect(mobileSajuDayNameV1(unresolved, 'en-US')).toBe('Not confirmed');
    expect(mobileSajuDayQualifiersV1(unresolved, 'en-US')).toBe('');
  });

  it('keeps server results and authority untouched while fixing only Saju visual labels', async () => {
    const [hero, detail] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/saju/SajuEditorialSummary.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/features/saju/SajuCalculationView.tsx', import.meta.url), 'utf8'),
    ]);
    expect(hero).toContain('mobileSajuDayNameV1(day, locale)');
    expect(hero).toContain('mobileSajuDayQualifiersV1(day, locale)');
    expect(detail).toContain('mobileSajuDayNameV1(dayMaster, locale)');
    expect(detail).toContain('mobileSajuDayQualifiersV1(dayMaster, locale)');
    expect(hero).not.toContain('fetch(');
    expect(detail).not.toContain('fetch(');
    expect(day).toEqual({ status: 'resolved', hanja: '丙', hangul: '병', element: '화', yinYang: '양' });
  });
});
