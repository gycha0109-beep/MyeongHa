/**
 * Metadata-only, OFFLINE Se-yeon boundary evaluation plan.
 * No provider, fetch, model keys, user prompts, token estimates or billing.
 * An admissible plan is never an approval for paid inference.
 */
import { SEYEON_DIALOGUE_PATH_CASE_IDS_V1 } from './seyeon-dialogue-path-eval-core-v1.mjs';

export const SEYEON_SECURITY_EVAL_PLAN_VERSION_V1 = 'seyeon-security-four-cell-plan-v1';
export const SEYEON_SECURITY_EVAL_PILOT_CASE_CAP_V1 = 4;
export const SEYEON_SECURITY_EVAL_PILOT_CALL_CAP_V1 = 64;
export const SEYEON_SECURITY_EVAL_CELLS_V1 = Object.freeze([
  Object.freeze({ cell: 'A', topology: 'legacy_five', boundary: 'V1', stages: Object.freeze([
    ['integrity_classification','gpt-5.6-terra'],
    ['disclosure_classification','gpt-5.6-terra'],
    ['turn_interpretation','gpt-5.6-terra'],
    ['dialogue_render','gpt-5.6-terra'],
    ['semantic_review','gpt-5.6-terra'],
  ]) }),
  Object.freeze({ cell: 'B', topology: 'legacy_five', boundary: 'V2', stages: Object.freeze([
    ['integrity_classification','gpt-5.6-terra'],
    ['disclosure_classification','gpt-5.6-terra'],
    ['turn_interpretation','gpt-5.6-terra'],
    ['dialogue_render','gpt-5.6-terra'],
    ['semantic_review','gpt-5.6-terra'],
  ]) }),
  Object.freeze({ cell: 'C', topology: 'fast_three', boundary: 'V1', stages: Object.freeze([
    ['unified_preflight_shadow','gpt-5.6-luna'],
    ['turn_interpret_render_shadow','gpt-5.6-terra'],
    ['semantic_review','gpt-5.6-terra'],
  ]) }),
  Object.freeze({ cell: 'D', topology: 'fast_three', boundary: 'V2', stages: Object.freeze([
    ['unified_preflight_shadow','gpt-5.6-luna'],
    ['turn_interpret_render_shadow','gpt-5.6-terra'],
    ['semantic_review','gpt-5.6-terra'],
  ]) }),
]);

export function buildSeyeonSecurityFourCellOfflinePlanV1(input) {
  if (!input || !Array.isArray(input.caseIds) ||
      input.caseIds.length < 1 ||
      input.caseIds.length > SEYEON_DIALOGUE_PATH_CASE_IDS_V1.length ||
      new Set(input.caseIds).size !== input.caseIds.length ||
      input.caseIds.some(id => !SEYEON_DIALOGUE_PATH_CASE_IDS_V1.includes(id))) {
    throw new TypeError('Invalid or duplicate synthetic case IDs.');
  }
  if (!Number.isSafeInteger(input.v1Characters) || !Number.isSafeInteger(input.v2Characters) ||
      input.v1Characters < 1 || input.v2Characters < 1) {
    throw new TypeError('Pinned policy text lengths are required.');
  }
  const cells = SEYEON_SECURITY_EVAL_CELLS_V1.map(cell => ({
    cell: cell.cell,
    topology: cell.topology,
    boundary: cell.boundary,
    plannedCalls: input.caseIds.length * cell.stages.length,
    stages: cell.stages.map(([purpose, model]) => ({ purpose, model })),
    boundaryCharactersPerCall: cell.boundary === 'V1'
      ? input.v1Characters : input.v2Characters,
    // This is a theoretical string payload comparison, not tokens or billing.
    boundaryCharactersAcrossCalls:
      input.caseIds.length * cell.stages.length *
        (cell.boundary === 'V1' ? input.v1Characters : input.v2Characters),
  }));
  const callCeiling = cells.reduce((sum, c) => sum + c.plannedCalls, 0);
  const pilotEligible = input.caseIds.length <= SEYEON_SECURITY_EVAL_PILOT_CASE_CAP_V1 &&
    callCeiling <= SEYEON_SECURITY_EVAL_PILOT_CALL_CAP_V1;
  return Object.freeze({
    schemaVersion: SEYEON_SECURITY_EVAL_PLAN_VERSION_V1,
    caseIds: Object.freeze([...input.caseIds]),
    fixtureCount: input.caseIds.length,
    cells,
    callCeiling,
    pilotCap: SEYEON_SECURITY_EVAL_PILOT_CALL_CAP_V1,
    pilotEligible,
    actualCalls: 0,
    inputTokens: null,
    cachedTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    p50Ms: null,
    p95Ms: null,
    guardQualityValidated: false,
    modelSecurityValidated: false,
    productionChanged: false,
    paidEvaluationPermitted: false,
    approvalRequired: true,
    verdict: 'HOLD_PAID_EVAL_LOCKED',
  });
}
