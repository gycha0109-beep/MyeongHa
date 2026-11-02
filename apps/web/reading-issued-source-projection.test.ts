import { describe, expect, it } from 'vitest';
import {
  blockTexts, issuedSectionSourcePartsV1,
} from './reading-issued-source-projection.js';

describe('issued official Reading block categories', () => {
  it('routes source_hint evidence to structural provenance, not issued interpretation', () => {
    const result = issuedSectionSourcePartsV1([
      { type: 'paragraph', text: '발행된 사주 해석' },
      { type: 'source_hint', text: '명식 원국 출처 확인' },
      { type: 'paragraph', text: '근거 구조: 일간 기준' },
      { type: 'paragraph', text: '두 번째 설명' },
    ], { isStoredRecord: true });
    expect(result.interpretation).toEqual(['발행된 사주 해석', '두 번째 설명']);
    expect(result.structure).toEqual(['명식 원국 출처 확인', '근거 구조: 일간 기준']);
  });

  it('retains evidence-only official sections without manufacturing an interpretation', () => {
    const result = issuedSectionSourcePartsV1([
      { type: 'source_hint', text: '확정 계산 출처' },
    ], { isStoredRecord: true });
    expect(result.interpretation).toEqual([]);
    expect(result.structure).toEqual(['확정 계산 출처']);
  });

  it('preserves the legacy Preview presentation independently', () => {
    const result = issuedSectionSourcePartsV1([
      { type: 'source_hint', text: '프리뷰 출처 문구' },
      { type: 'paragraph', text: '근거 구조: 계산 결과' },
    ]);
    expect(result.interpretation).toEqual(['프리뷰 출처 문구']);
    expect(result.structure).toEqual(['근거 구조: 계산 결과']);
  });

  it('keeps all supported issued block types, order and source-owned wording', () => {
    const blocks = [
      { type: 'key_points', items: ['가', '나'] },
      { type: 'comparison', perspectives: [{ label: '전', text: '전반' }] },
      { type: 'ambiguity', summary: '불명확', scenarios: [{ label: '후', text: '후반' }] },
      { type: 'timeline', entries: [{ label: '2026', text: '확인된 범위' }] },
      { type: 'fact_table', rows: [{ label: '오행', value: '목' }] },
    ];
    const result = issuedSectionSourcePartsV1(blocks, { isStoredRecord: true });
    expect(result.interpretation).toEqual([
      '가', '나', '전: 전반', '불명확', '후: 후반',
      '2026: 확인된 범위', '오행: 목',
    ]);
    expect(result.structure).toEqual([]);
    expect(blockTexts({ type: 'unsupported', text: '발행되지 않음' })).toEqual([]);
  });

  it('protects against missing blocks and prevents mutation of projected categories', () => {
    const empty = issuedSectionSourcePartsV1(null, { isStoredRecord: true });
    expect(empty).toEqual({ structure: [], interpretation: [] });
    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(empty.structure)).toBe(true);
    expect(Object.isFrozen(empty.interpretation)).toBe(true);
  });
});