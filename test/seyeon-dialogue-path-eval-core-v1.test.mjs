import { describe, expect, it } from 'vitest';
import { SEYEON_MODEL_EVAL_CASES_V1 } from '../scripts/seyeon-model-eval-cases-v1.mjs';
import {
  SEYEON_DIALOGUE_PATH_CASE_IDS_V1,
  SEYEON_DIALOGUE_PATH_ROUTES_V1,
  SEYEON_DIALOGUE_PATH_MAX_CALLS_V1,
  SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1,
  SEYEON_DIALOGUE_PATH_PRICES_V1,
  selectSeyeonDialoguePathCasesV1,
  estimateSeyeonDialoguePathCostV1,
  percentileSeyeonDialoguePathV1,
  summarizeSeyeonDialoguePathV1,
} from '../scripts/seyeon-dialogue-path-eval-core-v1.mjs';

describe('Se-yeon real API dialogue-path benchmark accounting', () => {
  it('pins 16 public first-contact synthetic prompts without changing the 100-case classifier gold set', () => {
    const cases = selectSeyeonDialoguePathCasesV1(SEYEON_MODEL_EVAL_CASES_V1);
    expect(cases.map(x => x.id)).toEqual(SEYEON_DIALOGUE_PATH_CASE_IDS_V1);
    expect(cases).toHaveLength(16);
    expect(cases.filter(x => x.id.startsWith('X')).map(x => x.id))
      .toEqual(['X01', 'X02', 'X03', 'X04', 'X05', 'X06']);
    expect(cases.every(x => x.topic === undefined && x.text.length <= 160)).toBe(true);
    expect(() => selectSeyeonDialoguePathCasesV1([
      ...SEYEON_MODEL_EVAL_CASES_V1.filter(x => x.id !== 'N01'),
      { id: 'N01', text: 'Sensitive synthetic', topic: 'past_romance_detail', noClaims: true },
    ])).toThrow('Fixture not eligible');
    expect(SEYEON_DIALOGUE_PATH_MAX_CALLS_V1).toBe(16 * (5 + 3));
    expect(SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1).toBeLessThanOrEqual(3);
  });

  it('counts cached tokens against input, never double-counts or invents usage', () => {
    const rates = SEYEON_DIALOGUE_PATH_PRICES_V1['gpt-5.6-terra'];
    const m = estimateSeyeonDialoguePathCostV1({
      input_tokens: 1200, output_tokens: 100,
      input_tokens_details: { cached_tokens: 300 },
    }, rates);
    expect(m).toEqual({
      input: 1200, cached: 300, output: 100,
      usd: (900 * 2 + 300 * .2 + 100 * 12) / 1_000_000,
    });
    const missing = estimateSeyeonDialoguePathCostV1({}, rates);
    expect(missing).toEqual({ input: 0, cached: 0, output: 0, usd: 0 });
  });

  it('calculates comparable route percentiles and does not equate gate acceptance with persona quality', () => {
    const rows = SEYEON_DIALOGUE_PATH_ROUTES_V1.flatMap(route =>
      ['N01','N02'].map((id, i) => ({
        id, route, outcome: 'admitted', errorCode: null,
        elapsedMs: 1000 + i * 1000,
        calls: route === 'legacy_5_terra' ? 5 : 3,
        estimatedCostUsd: .01,
      })));
    const summary = summarizeSeyeonDialoguePathV1(rows, 2);
    expect(summary.verdict).toBe('GUARD_SAMPLE_PASS');
    expect(summary.characterVoiceQualityVerified).toBe(false);
    expect(summary.routes.legacy_5_terra.observedCalls).toBe(10);
    expect(summary.routes.fast_3_luna_terra.observedCalls).toBe(6);
    expect(summary.routes.legacy_5_terra.p50Ms).toBe(1000);
    expect(summary.routes.legacy_5_terra.p95Ms).toBe(2000);
    expect(percentileSeyeonDialoguePathV1([], .95)).toBeNull();
    const held = summarizeSeyeonDialoguePathV1([
      ...rows.slice(0,3),
      { ...rows[3], outcome: 'rejected', errorCode: 'SEMANTIC_GUARD_REJECTED' },
    ], 2);
    const missingCalls = summarizeSeyeonDialoguePathV1([
      { ...rows[0], calls: 4 }, ...rows.slice(1),
    ], 2);
    expect(missingCalls.verdict).toBe('HOLD');
    const baselineRejected = summarizeSeyeonDialoguePathV1([
      { ...rows[0], outcome: 'rejected', errorCode: 'SEMANTIC_GUARD_REJECTED' },
      ...rows.slice(1),
    ], 2);
    expect(baselineRejected.verdict).toBe('HOLD');
    expect(baselineRejected.routes.legacy_5_terra.gateVerdict).toBe('HOLD');
    expect(baselineRejected.routes.fast_3_luna_terra.gateVerdict).toBe('GUARD_SAMPLE_PASS');
    expect(summary.routes.legacy_5_terra.gateVerdict).toBe('GUARD_SAMPLE_PASS');
    expect(summary.routes.fast_3_luna_terra.gateVerdict).toBe('GUARD_SAMPLE_PASS');
    expect(held.verdict).toBe('HOLD');
    expect(held.routes.fast_3_luna_terra.failureCases).toEqual([
      { id: 'N02', code: 'SEMANTIC_GUARD_REJECTED' },
    ]);
  });
});
