/**
 * COST-05: deterministic synthetic quota simulation ONLY.
 * This module cannot invoke a provider, transmit a request, change Production
 * budget policy, authorize paid evaluation, or reconcile provider invoices.
 * Every simulated reservation is irrevocably counted, including failures.
 */
import { inspectSeyeonC05OfflineRestartBudgetV1 } from './seyeon-cost-c05-offline-restart-preflight-v1.mjs';

export const SEYEON_C05_OFFLINE_QUOTA_VERSION_V1 =
  'seyeon-cost-c05-offline-pilot-quota-v1';
const STATES = new Set(['response_received','http_failure','timeout','network_failure']);
function safeInteger(value, min = 0) {
  return Number.isSafeInteger(value) && value >= min;
}
function sameShape(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key));
}
function safeNumber(big) {
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('C05 synthetic budget exceeds safe integer range');
  }
  return Number(big);
}

/**
 * A dry-run ledger with NO public dispatch method, NO network, and NO source
 * of true provider usage. Stage prices are explicitly unverified review input.
 */
export function createSeyeonC05OfflinePilotQuotaV1(input) {
  if (!input || input.mode !== 'NO_NETWORK_SYNTHETIC_ONLY' ||
      !safeInteger(input.callCap, 1) ||
      !safeInteger(input.auxiliaryReserveMicroUsd)) {
    throw new TypeError('C05 synthetic quota configuration invalid');
  }
  const plan = inspectSeyeonC05OfflineRestartBudgetV1(input.reviewInput);
  if (plan.stageOnlyConditionalMicroUsd === null ||
      plan.proposedBudgetMicroUsd === null ||
      plan.callCeiling < input.callCap) {
    throw new Error('C05 incomplete priced envelope or excessive call cap');
  }
  // Auxiliary charge is assumed for this simulation, never a verified real cap.
  const budget = BigInt(plan.proposedBudgetMicroUsd);
  const auxiliary = BigInt(input.auxiliaryReserveMicroUsd);
  if (auxiliary >= budget) {
    throw new Error('C05 no budget remains after auxiliary reserve');
  }
  const available = budget - auxiliary;
  const cases = new Set(input.reviewInput.caseIds);
  const cells = new Map(plan.cells.map(cell => [
    cell.cell, new Map(cell.stages.map(stage =>
      [stage.purpose, stage.perDispatchConditionalMicroUsd])),
  ]));
  const records = new Map();
  let spent = 0n;
  let uncertainOutcomes = 0;

  function reserveSyntheticStage(request) {
    if (!sameShape(request, ['cell','caseId','purpose']) ||
        typeof request.cell !== 'string' ||
        typeof request.caseId !== 'string' ||
        typeof request.purpose !== 'string' ||
        !cases.has(request.caseId) || !cells.has(request.cell) ||
        !cells.get(request.cell).has(request.purpose)) {
      throw new Error('C05 unknown synthetic stage or case');
    }
    const callRef = [request.cell, request.caseId, request.purpose].join(':');
    if (records.has(callRef)) {
      throw new Error('C05 duplicate synthetic stage or retry rejected');
    }
    const cost = BigInt(cells.get(request.cell).get(request.purpose));
    if (records.size >= input.callCap || spent + cost > available) {
      throw new Error('C05 synthetic calls or budget ceiling exhausted');
    }
    spent += cost; // never refunded: timeout and missing usage still occupy cap
    records.set(callRef, { ceiling: cost, outcome: null, estimate: null });
    return Object.freeze({
      callRef,
      stageOnlyReservedMicroUsd: safeNumber(cost),
      dispatchAuthorized: false,
      paidEvaluationPermitted: false,
    });
  }

  function recordSyntheticOutcome(report) {
    if (!sameShape(report, ['callRef','outcome','estimatedCostMicroUsd']) ||
        typeof report.callRef !== 'string' ||
        !STATES.has(report.outcome) ||
        !(report.estimatedCostMicroUsd === null ||
          safeInteger(report.estimatedCostMicroUsd))) {
      throw new TypeError('C05 invalid synthetic outcome');
    }
    const record = records.get(report.callRef);
    if (!record) throw new Error('C05 outcome without prior reservation');
    if (record.outcome !== null) {
      // No retry or conflicting callback may release/rebill a reservation.
      if (record.outcome !== report.outcome ||
          record.estimate !== report.estimatedCostMicroUsd) {
        throw new Error('C05 conflicting outcome replay rejected');
      }
      return Object.freeze({
        observation: 'DUPLICATE_SYNTHETIC_OUTCOME',
        actualProviderInvoiceMicroUsd: null,
      });
    }
    record.outcome = report.outcome;
    record.estimate = report.estimatedCostMicroUsd;
    const uncertain = report.estimatedCostMicroUsd === null ||
      BigInt(report.estimatedCostMicroUsd) > record.ceiling;
    if (uncertain) uncertainOutcomes += 1;
    return Object.freeze({
      observation: uncertain
        ? 'UNKNOWN_OR_OVER_CEILING_HOLD'
        : 'UNVERIFIED_SYNTHETIC_ESTIMATE',
      actualProviderInvoiceMicroUsd: null,
    });
  }

  function snapshot() {
    return Object.freeze({
      schemaVersion: SEYEON_C05_OFFLINE_QUOTA_VERSION_V1,
      mode: 'NO_NETWORK_SYNTHETIC_ONLY',
      reservedCalls: records.size,
      callCap: input.callCap,
      stageOnlyReservedMicroUsd: safeNumber(spent),
      auxiliaryAssumedReserveMicroUsd: safeNumber(auxiliary),
      proposedBudgetMicroUsd: safeNumber(budget),
      remainingStageOnlyMicroUsd: safeNumber(available - spent),
      unknownOrOverCeilingOutcomes: uncertainOutcomes,
      unresolvedOutcomes: [...records.values()]
        .filter(record => record.outcome === null).length,
      actualProviderInvoiceMicroUsd: null,
      hasDurableProviderReceiptEvidence: false,
      hasOwnerApproval: false,
      paidEvaluationPermitted: false,
      verdict: 'HOLD_NO_LIVE_DISPATCH',
    });
  }
  return Object.freeze({ reserveSyntheticStage, recordSyntheticOutcome, snapshot });
}
