import { describe, expect, it } from 'vitest';
import {
  READER_OFFICIAL_PRESENTATION_CHANNELS_V1,
  compareReaderOfficialLocaleContinuityV1,
  type ReaderOfficialSourceMeaningWitnessV1,
} from './reader-official-locale-continuity-v1.js';

const source: ReaderOfficialSourceMeaningWitnessV1 = Object.freeze({
  readingRef: 'official-reading-42',
  officialArtifactResponseHash: 'sha256:v1:abc123',
  sourceSemanticHash: 'semantic-unchanged-v1',
  scopedSourceUnitRefs: Object.freeze(['unit-a', 'unit-b']),
  requiredQualifierRefs: Object.freeze(['epistemic-may']),
  requiredConditionRefs: Object.freeze(['period-2026']),
  requiredAmbiguityRefs: Object.freeze(['timing-unknown']),
  requiredDisclosureRefs: Object.freeze(['method-limit']),
});

describe('I18N official Reader source meaning continuity handoff', () => {
  it('keeps identical official meaning witnesses across the existing three product channels', () => {
    for (const channel of READER_OFFICIAL_PRESENTATION_CHANNELS_V1) {
      for (const requestedLocale of ['ko-KR', 'ja-JP', 'zh-TW']) {
        expect(compareReaderOfficialLocaleContinuityV1({
          channel,
          requestedLocale,
          officialSource: source,
          presentedSource: {
            ...source,
            scopedSourceUnitRefs: ['unit-b', 'unit-a'],
          },
        })).toEqual({
          state: 'metadata_aligned_hold',
          schemaVersion: 'reader-official-locale-continuity-v1',
          channel,
          locale: requestedLocale,
          readingRef: 'official-reading-42',
          officialArtifactResponseHash: 'sha256:v1:abc123',
          release: 'existing_product_and_semantic_guards_required',
        });
      }
    }
  });

  it('refuses unsupported locales independent of UI locale/catalog registration', () => {
    for (const locale of ['ja', 'zh-CN', 'en-US', 'ko-kr', '']) {
      expect(compareReaderOfficialLocaleContinuityV1({
        channel: 'reader_follow_up', requestedLocale: locale,
        officialSource: source, presentedSource: source,
      })).toEqual({ state: 'hold', reason: 'unsupported_locale' });
    }
  });

  it('holds another official response/meaning identity even when the prose looks compatible', () => {
    for (const update of [
      { readingRef: 'different-reading' },
      { officialArtifactResponseHash: 'sha256:v1:changed' },
      { sourceSemanticHash: 'different-meaning' },
    ]) {
      expect(compareReaderOfficialLocaleContinuityV1({
        channel: 'record_detail', requestedLocale: 'ja-JP',
        officialSource: source, presentedSource: { ...source, ...update },
      })).toEqual({ state: 'hold', reason: 'source_identity_changed' });
    }
  });

  it('holds added/missing source units as a semantic scope change', () => {
    for (const scopedSourceUnitRefs of [['unit-a'], ['unit-a', 'unit-b', 'unit-c']]) {
      expect(compareReaderOfficialLocaleContinuityV1({
        channel: 'purchase_summary', requestedLocale: 'zh-TW',
        officialSource: source, presentedSource: { ...source, scopedSourceUnitRefs },
      })).toEqual({ state: 'hold', reason: 'semantic_scope_changed' });
    }
  });

  it('holds loss of uncertainty qualifiers and period or conditional restrictions', () => {
    for (const update of [
      { requiredQualifierRefs: [] },
      { requiredConditionRefs: [] },
      { requiredConditionRefs: ['unsupported-period'] },
    ]) {
      expect(compareReaderOfficialLocaleContinuityV1({
        channel: 'reader_follow_up', requestedLocale: 'ja-JP',
        officialSource: source, presentedSource: { ...source, ...update },
      })).toEqual({ state: 'hold', reason: 'qualifier_or_condition_changed' });
    }
  });

  it('holds missing ambiguity/limitation disclosures', () => {
    for (const update of [
      { requiredAmbiguityRefs: [] },
      { requiredDisclosureRefs: [] },
    ]) {
      expect(compareReaderOfficialLocaleContinuityV1({
        channel: 'purchase_summary', requestedLocale: 'ko-KR',
        officialSource: source, presentedSource: { ...source, ...update },
      })).toEqual({ state: 'hold', reason: 'required_protection_changed' });
    }
  });

  it('rejects duplicates, empty reading scope, and malformed witness references', () => {
    for (const invalid of [
      { scopedSourceUnitRefs: ['unit-a', 'unit-a'] },
      { scopedSourceUnitRefs: [] },
      { requiredQualifierRefs: ['may', 'may'] },
      { officialArtifactResponseHash: '' },
    ]) {
      expect(compareReaderOfficialLocaleContinuityV1({
        channel: 'record_detail', requestedLocale: 'ko-KR',
        officialSource: source, presentedSource: { ...source, ...invalid },
      })).toEqual({ state: 'hold', reason: 'invalid_source_witness' });
    }
  });
});
