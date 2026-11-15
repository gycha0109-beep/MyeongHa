/** Yeoul GEPA owner-declared KRW 500 cumulative cap (2026-11-12).
 * Offline/non-authoritative planning only. No network client, key, authority, or sender.
 */
const ROLES = Object.freeze(['student','reflection','judge','holdout']);
export const YEOUL_OWNER_DECLARED_PILOT_CAP_KRW = 500;
const error = code => { throw new Error('YEOUL_KRW_BUDGET_INVALID:'+code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value)
  && Object.keys(value).sort().join('|') === [...fields].sort().join('|');
const int = value => Number.isSafeInteger(value) && value >= 0 && typeof value === 'number';
const integerText = value => typeof value === 'string' && /^(?:0|[1-9]\d{0,29})$/u.test(value);
const number = (value, name) => {
  if (!integerText(value)) error('invalid_'+name);
  return BigInt(value);
};
const ceil = (a, b) => (a+b-1n)/b;
const ONE_BILLION = 1000000000n;
const feeFields = Object.freeze(['providerFeeKrw','exchangeFeeKrw','taxKrw','paymentFeeKrw','otherFeeKrw']);

/** Every attempt (including retries) rounds UP separately to one whole KRW.
 * Spot FX is NOT an executable rate ceiling; evidence is an unverified upper-bound claim.
 */
export function planYeoulKrwBudget({costQuote,fxUpperEvidence,fees,nowEpoch}) {
  if (!exact(costQuote, [
    'schemaVersion','roles','worstTotalMicroUsd','proposedCapMicroUsd',
    'quoteFitsProposedCap','priceSourceUrl','priceObservedAt',
    'rateSourceProviderVerified','priceComponentsAuthenticated',
    'userBudgetCapAuthorityVerified','reflectionJudgeModelsApproved',
    'externalCallsAuthorized','noActualSpend',
  ]) || costQuote.schemaVersion!=='yeoul-gepa-cost-quote-v1'
    || costQuote.externalCallsAuthorized!==false || costQuote.noActualSpend!==true
    || costQuote.priceComponentsAuthenticated!==false
    || costQuote.userBudgetCapAuthorityVerified!==false
    || !exact(costQuote.roles,ROLES)) error('untrusted_cost_quote');
  if (!exact(fxUpperEvidence,[
    'kind','sourceUrl','observedAtEpoch','expiresAtEpoch','upperMilliKrwPerUsd'
  ]) || fxUpperEvidence.kind!=='unverified_fx_upper_bound'
    || typeof fxUpperEvidence.sourceUrl !== 'string'
    || !/^https:\/\//u.test(fxUpperEvidence.sourceUrl)
    || !int(nowEpoch) || !int(fxUpperEvidence.observedAtEpoch)
    || !int(fxUpperEvidence.expiresAtEpoch)
    || !int(fxUpperEvidence.upperMilliKrwPerUsd)
    || fxUpperEvidence.upperMilliKrwPerUsd < 1
    || fxUpperEvidence.observedAtEpoch >= fxUpperEvidence.expiresAtEpoch
    || fxUpperEvidence.expiresAtEpoch - fxUpperEvidence.observedAtEpoch > 3600
    || nowEpoch < fxUpperEvidence.observedAtEpoch
    || nowEpoch >= fxUpperEvidence.expiresAtEpoch)
    error('fx_quote_missing_or_stale');
  if (!exact(fees,feeFields) || feeFields.some(f => !int(fees[f])))
    error('all_fixed_fee_ceiling_fields_required');

  let quotedUsd=0n, convertedKrw=0n, attempts=0;
  const roleBreakdown={};
  for(const role of ROLES) {
    const data=costQuote.roles[role];
    if (!exact(data,[
      'modelId','providerId','attemptsIncludingRetries',
      'worstPerAttemptMicroUsd','worstRoleMicroUsd'
    ]) || typeof data.modelId!=='string' || !data.modelId.trim()
      || typeof data.providerId!=='string' || !data.providerId.trim()
      || !int(data.attemptsIncludingRetries)
      || data.attemptsIncludingRetries > 10000)
      error('role_contract');
    const perAttempt=number(data.worstPerAttemptMicroUsd,'per_attempt_price');
    const total=number(data.worstRoleMicroUsd,'role_total_price');
    const count=BigInt(data.attemptsIncludingRetries);
    if (perAttempt*count!==total || (count>0n && perAttempt===0n))
      error('role_price_or_retries_mismatch');
    quotedUsd+=total;
    attempts+=data.attemptsIncludingRetries;
    // microUSD * milliKRW/USD / (1,000,000 * 1,000) => whole KRW
    const krwPerAttempt=count===0n ? 0n
      : ceil(perAttempt*BigInt(fxUpperEvidence.upperMilliKrwPerUsd),ONE_BILLION);
    const krwRole=krwPerAttempt*count;
    convertedKrw+=krwRole;
    roleBreakdown[role]=Object.freeze({
      attemptsIncludingRetries:data.attemptsIncludingRetries,
      modelId:data.modelId,providerId:data.providerId,
      ceilKrwPerAttempt:krwPerAttempt.toString(),
      ceilKrwForRole:krwRole.toString()
    });
  }
  if (quotedUsd!==number(costQuote.worstTotalMicroUsd,'total_price'))
    error('forged_total_price');
  let fixedFees=0n;
  for(const fee of feeFields) fixedFees+=BigInt(fees[fee]);
  const worstKrw=convertedKrw+fixedFees;
  const cap=BigInt(YEOUL_OWNER_DECLARED_PILOT_CAP_KRW);
  const unverifiedMaxUsd=cap > fixedFees
    ? (cap-fixedFees)*ONE_BILLION/BigInt(fxUpperEvidence.upperMilliKrwPerUsd):0n;
  return Object.freeze({
    schemaVersion:'yeoul-krw500-pilot-budget-plan-v1',
    target:'yeoul_gepa_pilot_all_roles_total',
    currency:'KRW',ownerDeclaredTotalLimitKrw:YEOUL_OWNER_DECLARED_PILOT_CAP_KRW,
    ownerBudgetSource:'chat_statement_only_not_runtime_verified',
    roleBreakdown:Object.freeze(roleBreakdown),
    quotedAllRolesMicroUsd:quotedUsd.toString(),
    totalAttemptsIncludingRetries:attempts,
    worstConvertedRequestsKrw:convertedKrw.toString(),
    fixedFeesCeilingKrw:fixedFees.toString(),
    worstTotalKrwIncludingDeclaredFees:worstKrw.toString(),
    quoteUnderDeclaredCap:worstKrw<=cap,
    remainingKrwIfAssumptionsHold:(worstKrw<=cap?cap-worstKrw:0n).toString(),
    indicativeUsdBudgetMicroNotExecutable:unverifiedMaxUsd.toString(),
    fxUpperRateMilliKrwPerUsd:fxUpperEvidence.upperMilliKrwPerUsd,
    priceAndFxSourcesAuthenticated:false,
    fxRateAndFeeCeilingsEnforcedByPaymentProvider:false,
    userApprovalAuthorityAuthenticated:false,
    prepaidFundingAndMinimumTopUpVerified:false,
    existingPrepaidCreditsVerified:false,
    newCreditPurchaseAllowed:false,
    pending: Object.freeze([
      'existing_prepaid_credit_balance_or_block_new_funding',
      'verified_fx_upper_bound_and_payment_spread',
      'verified_provider_tariffs_and_all_billable_components',
      'verified_fees_taxes_and_payment_top_up_minimums',
      'trusted_owner_approval_with_krw500_limit_and_scope',
      'durable_atomic_krw_and_usd_spend_admission',
      'independent_evaluation_and_human_review',
      'live_route_enforcement_and_receipt_reconciliation',
    ]),
    externalCallsAuthorized:false,paidExecutionReady:false,
    ownerApprovalGrantedToTransport:false,externalCalls:0,
    decision:'HOLD_PLANNING_QUOTE_ONLY'
  });
}
