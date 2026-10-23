/**
 * C08 (post-R3) FREE N06 stage-by-stage completion-cap feasibility.
 * No provider calls, no routing change, no guarantee of actual tokens/cost.
 * These request bytes were captured from the actual compact adapter body in
 * C08-R3's fake-fetch test. They are NOT a provider tokenizer measurement.
 */
import {
  quoteSeyeonThreeCallTenKrwShadowV1,
  SEYEON_C08R3_STAGES_V1,
  SEYEON_C08R3_MAX_RATES_V1,
  SEYEON_C08R3_TURN_MAX_MICRO_USD_V1,
} from './seyeon-c08r3-10krw-reserve-scenario-v1.mjs';

export const SEYEON_C08_N06_COMPACT_REQUEST_BYTES_V1 =
  Object.freeze([5425, 14041, 12737]);

/**
 * The R3 quotation already rejects missing bounds, extra paid calls, and
 * unknown rates/fees. Do not translate a passing quote into authorization:
 * strict JSON feasibility, reasoning-token use, and provider billing caps are
 * still unproven. The maxCompletionTokens budget includes reasoning tokens.
 */
export function auditSeyeonStageCompletionCapsOfflineV1({
  caps,
  rates = SEYEON_C08R3_MAX_RATES_V1,
} = {}) {
  if (!Array.isArray(caps) || caps.length !== 3 ||
      !caps.every((v) => Number.isSafeInteger(v) && v >= 1 && v <= 1536)) {
    throw new TypeError('C08_STAGE_CAP_UNVERIFIED_HOLD');
  }
  const stages = SEYEON_C08R3_STAGES_V1.map((name, i) => ({
    name,
    requestBodyBytes: SEYEON_C08_N06_COMPACT_REQUEST_BYTES_V1[i],
    maxCompletionTokens: caps[i],
  }));
  const quote = quoteSeyeonThreeCallTenKrwShadowV1({
    stages, rates, extraPaidCalls: 0, perRequestFeeMicroUsd: 0,
  });
  // Theoretical zero-output lower bound ONLY: three JSON responses in reality
  // require positive tokens; this lower bound is not a runnable plan.
  const inputOnlyMicroUsd = stages.reduce(
    (total, stage) =>
      total + Math.ceil(stage.requestBodyBytes * rates.inputUsdPerMillion),
    0,
  );
  const inputAlreadyExceedsTarget =
    inputOnlyMicroUsd > SEYEON_C08R3_TURN_MAX_MICRO_USD_V1;
  return Object.freeze({
    version: 'seyeon-c08-stage-cap-feasibility-offline-v1',
    scope: 'OFFLINE_N06_SCENARIO_ONLY_NO_DISPATCH',
    caps: Object.freeze([...caps]),
    inputOnlyTheoreticalMicroUsd: inputOnlyMicroUsd,
    inputAlreadyExceedsTarget,
    quote,
    completionTokensIncludeReasoning: true,
    strictJsonAtTheseCapsVerified: false,
    independentSemanticQualityVerified: false,
    actualTokenizerBoundVerified: false,
    exactProviderRateVerified: false,
    perRequestFeeVerified: false,
    providerHardCapVerified: false,
    actualBilledAmountVerified: false,
    latencyFiveSecondsVerified: false,
    permittedToDispatch: false,
    permittedToPromote: false,
  });
}
