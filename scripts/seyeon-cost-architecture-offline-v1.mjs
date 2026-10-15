/**
 * COST-01/02 offline architecture decision laboratory.
 * NOT a server router, user-data authority, GPT dispatcher or paid benchmark.
 * There is deliberately NO generate/fetch, token, secret, or DB dependency.
 *
 * A two-call design cannot run through the existing Governed Preflight guard
 * until a DB/Character/Security Owner-authorized deterministic admission is
 * implemented. These route labels are ONLY a prospective call topology.
 */
import { SEYEON_MODEL_EVAL_CASES_V1 } from './seyeon-model-eval-cases-v1.mjs';
import {
  SEYEON_DIALOGUE_PATH_PRICES_V1,
  selectSeyeonDialoguePathCasesV1,
} from './seyeon-dialogue-path-eval-core-v1.mjs';

export const SEYEON_COST_ARCHITECTURE_OFFLINE_V1 =
  'seyeon-cost-architecture-offline-v1';

export const SEYEON_COST_REFERENCE_PLANS_V1 = Object.freeze({
  legacy_5: Object.freeze([
    Object.freeze({ purpose:'integrity_classification', model:'gpt-5.6-terra' }),
    Object.freeze({ purpose:'disclosure_classification', model:'gpt-5.6-terra' }),
    Object.freeze({ purpose:'turn_interpretation', model:'gpt-5.6-terra' }),
    Object.freeze({ purpose:'dialogue_render', model:'gpt-5.6-terra' }),
    Object.freeze({ purpose:'semantic_review', model:'gpt-5.6-terra' }),
  ]),
  fixed_3: Object.freeze([
    Object.freeze({ purpose:'unified_preflight_shadow', model:'gpt-5.6-luna' }),
    Object.freeze({ purpose:'turn_interpret_render_shadow', model:'gpt-5.6-terra' }),
    Object.freeze({ purpose:'semantic_review', model:'gpt-5.6-terra' }),
  ]),
  proposed_2: Object.freeze([
    Object.freeze({ purpose:'turn_interpret_render_shadow', model:'gpt-5.6-terra' }),
    Object.freeze({ purpose:'semantic_review', model:'gpt-5.6-terra' }),
  ]),
});

export const SEYEON_COST_ROUTE_APPROVAL_V1 = Object.freeze({
  legacy_5:'REFERENCE_TOPOLOGY_ONLY',
  fixed_3:'SHADOW_ONLY_NOT_PRODUCTION',
  proposed_2:'DESIGN_ONLY_REQUIRES_NEW_AUTHORIZED_PREFLIGHT',
  hold:'NO_MODEL_REQUEST',
});

// ONLY those source-verifiable first-contact samples, not general language.
const fixtureEntries=selectSeyeonDialoguePathCasesV1(SEYEON_MODEL_EVAL_CASES_V1);
const byText=new Map(fixtureEntries.map(({id,text})=>[text,id]));
if (byText.size!==fixtureEntries.length || fixtureEntries.length!==16) {
  throw new Error('Offline-first-contact corpus changed unexpectedly');
}
// A representative small *subset*, not a natural language classifier.
// Exact matching is intentional, including whitespace/Unicode.
export const SEYEON_COST_PROPOSED_TWO_CASES_V1 = Object.freeze(['N01','X01']);

function eligibleOfflineZeroContext(evidence) {
  return evidence!==null && typeof evidence==='object' &&
    !Array.isArray(evidence) &&
    evidence.scope==='SYNTHETIC_OFFLINE_ONLY' &&
    evidence.characterId==='seyeon' &&
    evidence.sourceSelection==='exact_zero_only' &&
    evidence.sourceCount===0 &&
    evidence.originalGrantsPresent===false &&
    evidence.relationshipState==='none' &&
    evidence.recentHistoryMessageCount===0 &&
    evidence.approvedPrivateSourcesCount===0 &&
    evidence.unverifiedDerivedSourcesCount===0 &&
    evidence.pinnedTurn===true;
}

/**
 * Model call topology classification; NEVER authorizes user output.
 *
 * For all unknown text the reference 5-stage plan is the *only* candidate.
 * For incomplete/sensitive/memory-bearing context the selection is HOLD.
 * The fixture allowlist grants ZERO permissions. Unknown syntax, attacks,
 * claims, Unicode perturbations, and concatenation cannot get 2 calls.
 *
 * Because no real preflight is executed, even the exact matched 2-call
 * result MUST NOT be fed into runtime or advertised as production eligible.
 */
export function selectSeyeonCostRouteOfflineV1({ userText, evidence }={}) {
  if (!eligibleOfflineZeroContext(evidence) ||
      typeof userText!=='string' || userText.length===0 ||
      userText.length>4000) {
    return Object.freeze({
      route:'hold', reason:'MISSING_VERIFIED_ZERO_CONTEXT',
      status:SEYEON_COST_ROUTE_APPROVAL_V1.hold, stageCount:0,
    });
  }
  const fixtureId=byText.get(userText);
  const route=fixtureId===undefined ? 'legacy_5' :
    SEYEON_COST_PROPOSED_TWO_CASES_V1.includes(fixtureId)
      ? 'proposed_2' : 'fixed_3';
  return Object.freeze({
    route,
    reason:fixtureId===undefined?'NOT_IN_PUBLIC_SYNTHETIC_CORPUS':
      'EXACT_OFFLINE_PUBLIC_FIXTURE',
    status:SEYEON_COST_ROUTE_APPROVAL_V1[route],
    stageCount:SEYEON_COST_REFERENCE_PLANS_V1[route].length,
  });
}

export function seyeonCostOfflineZeroEvidenceV1() {
  // Test-only convenience, trivially forgeable. Never trust in an API/DB.
  return Object.freeze({
    scope:'SYNTHETIC_OFFLINE_ONLY',
    characterId:'seyeon',
    sourceSelection:'exact_zero_only',
    sourceCount:0,
    originalGrantsPresent:false,
    relationshipState:'none',
    recentHistoryMessageCount:0,
    approvedPrivateSourcesCount:0,
    unverifiedDerivedSourcesCount:0,
    pinnedTurn:true,
  });
}

function safeToken(v) {
  return Number.isSafeInteger(v) && v>=0;
}

/**
 * Calculate a *conditional*, estimated USD from complete PER-STAGE provider
 * usage. Unknown/missing usage MUST be unknown; no "0 means free".
 * Cached tokens are a subset of input and reasoning tokens a subset of output.
 * The prices are repository-defined historical evaluation estimates, NOT live
 * OpenAI prices or invoice amounts.
 *
 * No 2-call estimate is derivable by subtracting a 3-call classifier: the
 * proposed 2-call context/request payload would differ.
 */
export function calculateSeyeonConditionalRouteCostV1(planName, observations) {
  const plan=SEYEON_COST_REFERENCE_PLANS_V1[planName];
  if (!plan || !Array.isArray(observations) ||
      observations.length!==plan.length) {
    return Object.freeze({state:'UNKNOWN',estimatedUsd:null,reason:'INCOMPLETE_STAGE_OBSERVATIONS'});
  }
  let total=0;
  const stages=[];
  for(let index=0;index<plan.length;index++){
    const expected=plan[index];
    const observed=observations[index];
    if (!observed || expected.purpose!==observed.purpose ||
        expected.model!==observed.model ||
        !safeToken(observed.inputTokens) ||
        !safeToken(observed.cachedInputTokens) ||
        !safeToken(observed.outputTokens) ||
        !safeToken(observed.reasoningTokens) ||
        observed.cachedInputTokens>observed.inputTokens ||
        observed.reasoningTokens>observed.outputTokens) {
      return Object.freeze({state:'UNKNOWN',estimatedUsd:null,reason:'UNVERIFIED_PROVIDER_USAGE'});
    }
    const rate=SEYEON_DIALOGUE_PATH_PRICES_V1[expected.model];
    if (!rate) {
      return Object.freeze({state:'UNKNOWN',estimatedUsd:null,reason:'MISSING_VERSIONED_MODEL_PRICE'});
    }
    const amount=((observed.inputTokens-observed.cachedInputTokens)*rate.input+
      observed.cachedInputTokens*rate.cached+
      observed.outputTokens*rate.output)/1_000_000;
    if (!Number.isFinite(amount) || amount<0) {
      return Object.freeze({state:'UNKNOWN',estimatedUsd:null,reason:'UNBOUNDED_ESTIMATE'});
    }
    total+=amount;
    stages.push(Object.freeze({
      purpose:expected.purpose,model:expected.model,estimatedUsd:amount,
      inputTokens:observed.inputTokens,cachedInputTokens:observed.cachedInputTokens,
      outputTokens:observed.outputTokens,reasoningTokens:observed.reasoningTokens,
    }));
  }
  return Object.freeze({
    state:'CONDITIONAL_REPOSITORY_PRICE_ESTIMATE_ONLY',
    estimatedUsd:Number(total.toFixed(9)),
    stages:Object.freeze(stages),
    actualInvoiceVerified:false,
    qualityVerified:false,
  });
}

/** Pure structure audit; no simulated token savings or model behavior. */
export function describeSeyeonCostTopologiesV1() {
  return Object.freeze(
    Object.entries(SEYEON_COST_REFERENCE_PLANS_V1).map(([route,stages])=>
      Object.freeze({
        route,calls:stages.length,purposes:Object.freeze(stages.map(s=>s.purpose)),
        status:SEYEON_COST_ROUTE_APPROVAL_V1[route],
        measuredProductionCostUsd:null,
        personaNonInferiorityProven:false,
      }),
    ),
  );
}
