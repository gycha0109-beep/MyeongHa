/**
 * COST-05: OFFLINE four-cell stage cost projection for restart review only.
 * No network, provider, credentials, DB, billing, admission, or live authority.
 * Caller-owned limits/rates are UNVERIFIED even when mathematically complete.
 * Input-count API charges, post-turn work and actual invoices are out of scope.
 */
import { SEYEON_SECURITY_EVAL_CELLS_V1 } from './seyeon-security-four-cell-eval-plan-v1.mjs';
import { SEYEON_DIALOGUE_PATH_CASE_IDS_V1 } from './seyeon-dialogue-path-eval-core-v1.mjs';

export const SEYEON_C05_OFFLINE_PREFLIGHT_VERSION_V1='seyeon-cost-c05-offline-restart-v1';
const MODELS=new Set(SEYEON_SECURITY_EVAL_CELLS_V1.flatMap(c=>c.stages.map(s=>s[1])));
// Provider model docs: above this input size, longer-context price
// multipliers apply. This offline estimator supports short context ONLY.
// A bound beyond this limit must not silently reuse the cheaper rate.
export const SEYEON_C05_STANDARD_RATE_MAX_INPUT_TOKENS_V1=272000;
const STAGES=new Map();
for(const cell of SEYEON_SECURITY_EVAL_CELLS_V1){
  for(const [purpose,modelKey] of cell.stages){
    const previous=STAGES.get(purpose);
    if(previous && previous!==modelKey)throw new TypeError('Ambiguous C05 model for purpose');
    STAGES.set(purpose,modelKey);
  }
}
function safeInt(x,minimum=0){return Number.isSafeInteger(x)&&x>=minimum;}
function requireFields(v,expected,label){
  if(!v||typeof v!=='object'||Array.isArray(v)||
      Object.keys(v).some(k=>!expected.includes(k))||
      expected.some(k=>!Object.hasOwn(v,k)))
    throw new TypeError('C05 invalid '+label+' shape');
}
function microCost(inputTokens,outputTokens,price){
  // Cache writes may cost MORE than ordinary uncached input (e.g. 1.25x).
  // No discount is reserved prospectively, and cache-write uplift is included.
  const uncachedMax=Math.max(price.inputMicroUsdPerMillion,
    price.cachedInputMicroUsdPerMillion,price.cacheWriteMicroUsdPerMillion);
  const numerator=BigInt(inputTokens)*BigInt(uncachedMax)+
                  BigInt(outputTokens)*BigInt(price.outputMicroUsdPerMillion);
  return (numerator+999999n)/1000000n; // round UP per dispatch; never assume cache
}
function numberOrThrow(n){
  if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('C05 microUSD exceeds safe integer range');
  return Number(n);
}

/** Source rates, limits and budget are untrusted owner-provided REVIEW inputs.
 * A complete computation is NOT live-price verification or budget admission.
 */
export function inspectSeyeonC05OfflineRestartBudgetV1(input){
  if(!input||input.scope!=='SYNTHETIC_OFFLINE_ONLY'||
      !Array.isArray(input.caseIds)||input.caseIds.length<1||
      input.caseIds.length>SEYEON_DIALOGUE_PATH_CASE_IDS_V1.length||
      new Set(input.caseIds).size!==input.caseIds.length||
      input.caseIds.some(x=>!SEYEON_DIALOGUE_PATH_CASE_IDS_V1.includes(x))||
      !Array.isArray(input.rateCards)||!Array.isArray(input.stageBounds)||
      input.rateCards.length>MODELS.size||input.stageBounds.length>STAGES.size||
      input.retries!==0||
      !(input.proposedBudgetMicroUsd===null||safeInt(input.proposedBudgetMicroUsd,1))){
    throw new TypeError('C05 offline budget envelope invalid');
  }
  const prices=new Map(),bounds=new Map();
  for(const rate of input.rateCards){
    requireFields(rate,['providerKey','modelKey','priceVersion','inputMicroUsdPerMillion',
       'cachedInputMicroUsdPerMillion','cacheWriteMicroUsdPerMillion',
       'outputMicroUsdPerMillion'],'rate');
    if(rate.providerKey!=='openai-responses'||!MODELS.has(rate.modelKey)||
       typeof rate.priceVersion!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(rate.priceVersion)||
       prices.has(rate.modelKey)||
       !safeInt(rate.inputMicroUsdPerMillion,1)||
       !safeInt(rate.cachedInputMicroUsdPerMillion)||
       !safeInt(rate.cacheWriteMicroUsdPerMillion,1)||
       !safeInt(rate.outputMicroUsdPerMillion,1))
      throw new TypeError('C05 unauthorized or malformed model rate');
    prices.set(rate.modelKey,rate);
  }
  for(const bound of input.stageBounds){
    requireFields(bound,['purpose','modelKey','verifiedInputTokenUpperBound',
      'enforcedOutputTokenLimit'],'stage bound');
    if(!STAGES.has(bound.purpose)||STAGES.get(bound.purpose)!==bound.modelKey||
       bounds.has(bound.purpose)||
       !safeInt(bound.verifiedInputTokenUpperBound,1)||
       bound.verifiedInputTokenUpperBound>SEYEON_C05_STANDARD_RATE_MAX_INPUT_TOKENS_V1||
       !safeInt(bound.enforcedOutputTokenLimit,1))
      throw new TypeError('C05 invalid stage token bounds');
    bounds.set(bound.purpose,bound);
  }
  const missingRateModels=[...MODELS].filter(model=>!prices.has(model));
  const missingStageBounds=[...STAGES.keys()].filter(p=>!bounds.has(p));
  const rows=[];
  let known=0n,complete=true,callCeiling=0;
  for(const cell of SEYEON_SECURITY_EVAL_CELLS_V1){
    let conditional=0n,cellComplete=true;
    const stages=[];
    for(const [purpose,model] of cell.stages){
      const bound=bounds.get(purpose),rate=prices.get(model);
      const upper=bound&&rate?microCost(bound.verifiedInputTokenUpperBound,
        bound.enforcedOutputTokenLimit,rate):null;
      if(upper===null){cellComplete=false;complete=false;}
      else {conditional+=upper*BigInt(input.caseIds.length);known+=upper*BigInt(input.caseIds.length);}
      stages.push(Object.freeze({purpose,model,dispatchCount:input.caseIds.length,
        perDispatchConditionalMicroUsd:upper===null?null:numberOrThrow(upper)}));
    }
    const calls=cell.stages.length*input.caseIds.length;
    callCeiling+=calls;
    rows.push(Object.freeze({cell:cell.cell,topology:cell.topology,boundary:cell.boundary,
      callCeiling:calls,stageOnlyConditionalMicroUsd:cellComplete?numberOrThrow(conditional):null,
      stages:Object.freeze(stages)}));
  }
  const calculated=complete?known:null;
  const budget=input.proposedBudgetMicroUsd;
  return Object.freeze({
    schemaVersion:SEYEON_C05_OFFLINE_PREFLIGHT_VERSION_V1,
    scope:'OFFLINE_STAGE_ONLY_UNVERIFIED_OWNER_INPUT',
    caseCount:input.caseIds.length,
    callCeiling, retryAllowance:0,
    cells:Object.freeze(rows),
    missingRateModels:Object.freeze(missingRateModels),
    missingStageBounds:Object.freeze(missingStageBounds),
    knownStagePortionMicroUsd:numberOrThrow(known),
    stageOnlyConditionalMicroUsd:calculated===null?null:numberOrThrow(calculated),
    proposedBudgetMicroUsd:budget,
    exceedsProposedBudget:calculated===null||budget===null?null:calculated>BigInt(budget),
    // Count endpoint, failure/late billing, and post-turn work cannot be inferred.
    allInMaximumMicroUsd:null,
    actualProviderInvoiceMicroUsd:null,
    actualRateVerified:false,
    providerOutcomeDurabilityVerified:false,
    independentKillSwitchVerified:false,
    productionDbAndDrApproved:false,
    securityAndOwnerApproved:false,
    paidEvaluationPermitted:false,
    verdict:'HOLD_COST_INCIDENT_APPROVAL_REQUIRED',
    blockerCodes:Object.freeze([
      ...(missingRateModels.length?['MISSING_RATE_CARD']:[]),
      ...(missingStageBounds.length?['MISSING_TRUSTED_INPUT_AND_ENFORCED_OUTPUT_LIMITS']:[]),
      ...(budget===null?['NO_OWNER_BUDGET']:[]),
      ...(calculated!==null&&budget!==null&&calculated>BigInt(budget)?['PROPOSED_BUDGET_TOO_SMALL']:[]),
      'OFFICIAL_RATE_AND_PROVIDER_USAGE_NOT_VERIFIED',
      'AUXILIARY_AND_FAILED_CALL_COST_NOT_CLOSED',
      'DURABLE_RECEIPTS_AND_KILL_SWITCH_NOT_PROVEN',
      'PRODUCTION_DB_DR_AND_OWNER_SIGNOFF_OPEN',
    ]),
  });
}
