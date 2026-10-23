import { describe, it, expect } from 'vitest';
import { readerProvenanceLocaleLabelV1 } from '../reader-provenance-locale.js';
describe('reader provenance locale presentation', () => {
  it('retains Korean labels for the saved Reader IDs', () => {
    expect(readerProvenanceLocaleLabelV1(['seyeon'])).toBe('세연에게');
  });
  it('uses temporary Katakana or Roman names, without changing source IDs', () => {
    expect(readerProvenanceLocaleLabelV1(['seyeon'],'ja-JP')).toBe('セヨンによる鑑定');
    expect(readerProvenanceLocaleLabelV1(['baekheon','yeoul'],'ja-JP')).toBe('ベクホン · ヨウルによる鑑定');
    expect(readerProvenanceLocaleLabelV1(['seyeon','taegyeom'],'zh-TW')).toBe('Seyeon · Taegyeom的解讀');
  });
  it('does not invent identity when IDs are missing or invalid', () => {
    expect(readerProvenanceLocaleLabelV1(null,'zh-TW')).toBe('尚無 Reader 紀錄');
    expect(readerProvenanceLocaleLabelV1(['unknown'],'zh-TW')).toBe('代理人的解讀');
  });
});
