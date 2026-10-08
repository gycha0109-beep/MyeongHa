/**
 * Synthetic benchmark accounting only. No content, memory, identity, or prompts
 * are accepted into the evidence schema. A PASS means server guards admitted
 * the sample; it is never a verdict on Se-yeon personality quality.
 */
export const SEYEON_DIALOGUE_PATH_CASE_IDS_V1 = Object.freeze([
  'N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N09', 'N10',
  'N19', 'N22', 'X01', 'X02', 'X03', 'X04', 'X05', 'X06',
]);
/** These are fictional, no-claim, first-contact prompts. They do not join the 100-case classifier gold set. */
export const SEYEON_DIALOGUE_PATH_ADDITIONAL_CASES_V1 = Object.freeze([
  Object.freeze({ id: 'X01', text: '처음 인사니까 짧게 인사해 줘.', topic: null, noClaims: true }),
  Object.freeze({ id: 'X02', text: '가벼운 말장난 하나 해줄래?', topic: null, noClaims: true }),
  Object.freeze({ id: 'X03', text: '오늘 어떤 주제가 재미있을까?', topic: null, noClaims: true }),
  Object.freeze({ id: 'X04', text: '이번에는 네가 대화 주제를 골라줘.', topic: null, noClaims: true }),
  Object.freeze({ id: 'X05', text: '지금 가장 끌리는 책 장르 하나만 골라줘.', topic: null, noClaims: true }),
  Object.freeze({ id: 'X06', text: '질문 대신 네 생각부터 말해줘.', topic: null, noClaims: true }),
]);
export const SEYEON_DIALOGUE_PATH_ROUTES_V1 = Object.freeze([
  'legacy_5_terra',
  'fast_3_luna_terra',
]);
export const SEYEON_DIALOGUE_PATH_MAX_CALLS_V1 = 128;
export const SEYEON_DIALOGUE_PATH_MAX_ESTIMATED_COST_USD_V1 = 3;
export const SEYEON_DIALOGUE_PATH_PRICES_V1 = Object.freeze({
  'gpt-5.6-luna': Object.freeze({ input: 0.20, cached: 0.02, output: 1.20 }),
  'gpt-5.6-terra': Object.freeze({ input: 2.00, cached: 0.20, output: 12.00 }),
});

export function selectSeyeonDialoguePathCasesV1(allCases) {
  if (!Array.isArray(allCases)) throw new TypeError('Missing synthetic fixtures.');
  const available = [...allCases, ...SEYEON_DIALOGUE_PATH_ADDITIONAL_CASES_V1];
  const result = SEYEON_DIALOGUE_PATH_CASE_IDS_V1.map((id) => {
    const matches = available.filter((value) => value.id === id);
    if (matches.length !== 1 ||
      matches[0].topic !== null || matches[0].noClaims !== true ||
      typeof matches[0].text !== 'string' || matches[0].text.length > 160) {
      throw new TypeError('Fixture not eligible or changed: ' + id);
    }
    return Object.freeze({ id, text: matches[0].text });
  });
  return Object.freeze(result);
}

export function estimateSeyeonDialoguePathCostV1(usage, rates) {
  const token = (v) => Number.isSafeInteger(v) && v >= 0 ? v : 0;
  const input = token(usage.input_tokens);
  const output = token(usage.output_tokens);
  const cached = Math.min(input, token(usage.input_tokens_details?.cached_tokens));
  return {
    input, cached, output,
    usd: ((input - cached) * rates.input + cached * rates.cached + output * rates.output) / 1_000_000,
  };
}

export function percentileSeyeonDialoguePathV1(values, fraction) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!(fraction > 0 && fraction <= 1) || values.some(x => !Number.isFinite(x) || x < 0)) {
    throw new TypeError('Invalid percentile input.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

export function summarizeSeyeonDialoguePathV1(rows, totalCases) {
  const routes = Object.fromEntries(SEYEON_DIALOGUE_PATH_ROUTES_V1.map(route => {
    const items = rows.filter(row => row.route === route);
    const success = items.filter(row => row.outcome === 'admitted');
    const totalCost = items.reduce((sum, row) => sum + row.estimatedCostUsd, 0);
    const totalCalls = items.reduce((sum, row) => sum + row.calls, 0);
    const errorIds = items.filter(row => row.outcome !== 'admitted').map(row => ({
      id: row.id,
      code: row.errorCode,
    }));
    const expectedCalls = route === 'legacy_5_terra' ? 5 : 3;
    const gateVerdict = items.length === totalCases && success.length === totalCases &&
      items.every(row => row.calls === expectedCalls) ? 'GUARD_SAMPLE_PASS' : 'HOLD';
    return [route, {
      gateVerdict,
      samples: items.length,
      admitted: success.length,
      rejected: errorIds.length,
      observedCalls: totalCalls,
      totalEstimatedCostUsd: Number(totalCost.toFixed(6)),
      p50Ms: percentileSeyeonDialoguePathV1(items.map(row => row.elapsedMs), 0.5),
      p95Ms: percentileSeyeonDialoguePathV1(items.map(row => row.elapsedMs), 0.95),
      failureCases: errorIds,
    }];
  }));
  const complete = SEYEON_DIALOGUE_PATH_ROUTES_V1.every(route =>
    routes[route].gateVerdict === 'GUARD_SAMPLE_PASS');
  return Object.freeze({
    scope: 'SYNTHETIC_PUBLIC_FIRST_CONTACT_GUARD_ACCEPTANCE_ONLY',
    automaticPromotion: false,
    characterVoiceQualityVerified: false,
    verdict: complete ? 'GUARD_SAMPLE_PASS' : 'HOLD',
    routes,
  });
}
