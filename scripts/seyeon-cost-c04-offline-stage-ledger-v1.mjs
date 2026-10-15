/**
 * COST-04 purely synthetic accounting audit: never fetches, tokenizes, reserves
 * budget, writes DB, or calculates an actual invoice. NOT a Provider limiter.
 *
 * Price card is the historical repo evaluation rate, never live price evidence.
 * In particular, reasoningTokens are included IN outputTokens; cached input
 * is included IN inputTokens. Request bytes are NOT input-token counts.
 */
import {SEYEON_COST_REFERENCE_PLANS_V1} from './seyeon-cost-architecture-offline-v1.mjs';
import {SEYEON_DIALOGUE_PATH_PRICES_V1} from './seyeon-dialogue-path-eval-core-v1.mjs';
export const SEYEON_COST_C04_OFFLINE_VERSION_V1='seyeon-cost-c04-offline-stage-ledger-v1';
export const SEYEON_COST_C04_PRICE_SCOPE_V1='HISTORICAL_REPOSITORY_ESTIMATE_NOT_CURRENT_VENDOR_RATE';
function validInt(x,min=0){return Number.isSafeInteger(x)&&x>=min;}
function validUsage(usage){
  if(!usage||typeof usage!=='object'||Array.isArray(usage))return false;
  const {inputTokens,outputTokens,cachedInputTokens,reasoningTokens}=usage;
  for(const t of [inputTokens,outputTokens,cachedInputTokens,reasoningTokens]){
    if(t!==null&&!validInt(t))return false;
  }
  return (inputTokens===null||cachedInputTokens===null||cachedInputTokens<=inputTokens) &&
    (outputTokens===null||reasoningTokens===null||reasoningTokens<=outputTokens);
}
const options=new Set(['response_received','http_failure','network_failure','timeout','invalid_response']);
const postTurnStates=new Set(['NOT_APPLICABLE','CAPTURED','UNKNOWN']);
function stageRate(model){
  const p=SEYEON_DIALOGUE_PATH_PRICES_V1[model];
  if(!p)return null;
  return Object.freeze({
    input:BigInt(Math.round(p.input*1_000_000)),
    cached:BigInt(Math.round(p.cached*1_000_000)),
    output:BigInt(Math.round(p.output*1_000_000)),
  });
}
function roundUpNumerator(numerator){
  const rounded=(numerator+999_999n)/1_000_000n;
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))return null;
  return Number(rounded);
}
function priceActualStage(model,u){
  const p=stageRate(model);
  if(!p||u.inputTokens===null||u.outputTokens===null||u.cachedInputTokens===null)
    return null;
  return roundUpNumerator(
    BigInt(u.inputTokens-u.cachedInputTokens)*p.input+
    BigInt(u.cachedInputTokens)*p.cached+
    BigInt(u.outputTokens)*p.output,
  );
}
function priceCeiling(model,upper,outputCap){
  const p=stageRate(model);
  if(!p||!validInt(upper,1)||!validInt(outputCap,1))return null;
  // Cache discount is NEVER reserved as guaranteed.
  return roundUpNumerator(
    BigInt(upper)*(p.input>p.cached?p.input:p.cached)+
    BigInt(outputCap)*p.output,
  );
}

/**
 * Synthetic accounting rows:
 * {callId,stageIndex [0-based],attempt [1+],purpose,model,outcome,
 *  usage:{inputTokens,outputTokens,cachedInputTokens,reasoningTokens},
 *  verifiedInputTokenUpperBound:number|null,
 *  enforcedOutputTokenLimit:number|null,
 *  requestBodyBytes:number|null}.
 * Full foreground route must include each stage at least once iff completed.
 * Provider failures/uncertain usage always preserve UNKNOWN rather than $0.
 * retry attempts are separately charged and require contiguous numbering.
 */
export function auditSeyeonC04SyntheticRouteV1(input){
  const route=input?.route,plan=SEYEON_COST_REFERENCE_PLANS_V1[route];
  if(!plan||input.scope!=='SYNTHETIC_OFFLINE_ONLY'||
     !['COMPLETE','ABORTED'].includes(input.completion)||
     !postTurnStates.has(input.postTurnState)||
     !postTurnStates.has(input.tokenCounterState)||
     !Array.isArray(input.calls)||input.calls.length===0||input.calls.length>60){
    throw new TypeError('C04 synthetic route envelope invalid');
  }
  const ids=new Set(),counts=new Map();
  let knownMicro=0n,quotedCeilingMicro=0n,unknownUsage=0,unknownCeilings=0,
      failed=0,retries=0,knownCached=0n,knownInput=0n,
      knownOutput=0n,knownReasoning=0n;
  const unknownTokenFields={input:0,cachedInput:0,output:0,reasoningOutput:0};
  for(const call of input.calls){
    const step=plan[call?.stageIndex];
    if(!step||typeof call.callId!=='string'||
       !/^[a-zA-Z0-9._:-]{1,80}$/.test(call.callId)||ids.has(call.callId)||
       call.purpose!==step.purpose||call.model!==step.model||
       !options.has(call.outcome)||
       !validInt(call.attempt,1)||call.attempt>5||
       !validUsage(call.usage)||
       !(call.verifiedInputTokenUpperBound===null||
         validInt(call.verifiedInputTokenUpperBound,1))||
       !(call.enforcedOutputTokenLimit===null||
         validInt(call.enforcedOutputTokenLimit,1))||
       !(call.requestBodyBytes===null||validInt(call.requestBodyBytes,1))){
      throw new TypeError('C04 invalid or unauthorised stage accounting row');
    }
    if(call.usage.outputTokens!==null &&
       call.enforcedOutputTokenLimit!==null &&
       call.usage.outputTokens>call.enforcedOutputTokenLimit){
      throw new TypeError('C04 observed output exceeds claimed enforced ceiling');
    }
    const next=(counts.get(call.stageIndex)||0)+1;
    if(call.attempt!==next)throw new TypeError('C04 missing/duplicate retry attempt');
    counts.set(call.stageIndex,next);
    ids.add(call.callId);
    if(call.attempt>1)retries++;
    if(call.outcome!=='response_received')failed++;
    const c=priceActualStage(call.model,call.usage);
    if(c===null)unknownUsage++;
    else knownMicro+=BigInt(c);
    const upper=priceCeiling(call.model,call.verifiedInputTokenUpperBound,
      call.enforcedOutputTokenLimit);
    if(upper===null)unknownCeilings++;
    else quotedCeilingMicro+=BigInt(upper);
    const u=call.usage;
    if(u.inputTokens===null)unknownTokenFields.input++;
    if(u.cachedInputTokens===null)unknownTokenFields.cachedInput++;
    if(u.outputTokens===null)unknownTokenFields.output++;
    if(u.reasoningTokens===null)unknownTokenFields.reasoningOutput++;
    if(u.inputTokens!==null)knownInput+=BigInt(u.inputTokens);
    if(u.cachedInputTokens!==null)knownCached+=BigInt(u.cachedInputTokens);
    if(u.outputTokens!==null)knownOutput+=BigInt(u.outputTokens);
    if(u.reasoningTokens!==null)knownReasoning+=BigInt(u.reasoningTokens);
  }
  if(input.completion==='COMPLETE'&&counts.size!==plan.length)
    throw new TypeError('C04 complete route missing one or more stages');
  if(knownMicro>BigInt(Number.MAX_SAFE_INTEGER)||
     quotedCeilingMicro>BigInt(Number.MAX_SAFE_INTEGER)){
    throw new RangeError('C04 calculation exceeds safe integer');
  }
  // A CAPTURED status is not an itemized, priced event. This ledger has
  // foreground stages ONLY; post-turn/token-counter costs need separate rows
  // with their own verified rate cards before a session-total is knowable.
  const outsideUnknown=input.postTurnState!=='NOT_APPLICABLE'||
    input.tokenCounterState!=='NOT_APPLICABLE';
  const allKnown=unknownUsage===0&&!outsideUnknown;
  const allCeilings=unknownCeilings===0&&!outsideUnknown;
  return Object.freeze({
    status:allKnown?'CONDITIONAL_REPO_PRICE_ESTIMATE':'UNKNOWN_TOTAL_COST',
    scope:SEYEON_COST_C04_OFFLINE_VERSION_V1,
    rateScope:SEYEON_COST_C04_PRICE_SCOPE_V1,
    stageCount:plan.length,
    callAttempts:input.calls.length,failedCallAttempts:failed,
    retryAttempts:retries,
    unknownUsageAttempts:unknownUsage,
    unknownAdmissionCeilings:unknownCeilings,
    postTurnState:input.postTurnState,tokenCounterState:input.tokenCounterState,
    knownPortionMicroUsd:Number(knownMicro),
    totalConditionalMicroUsd:allKnown?Number(knownMicro):null,
    knownCeilingPortionMicroUsd:Number(quotedCeilingMicro),
    totalAdmissionCeilingMicroUsd:allCeilings?Number(quotedCeilingMicro):null,
    partialKnownTokens:Object.freeze({
      input:Number(knownInput),cachedInput:Number(knownCached),
      output:Number(knownOutput),reasoningOutput:Number(knownReasoning),
    }),
    tokenUnknownAttemptCounts:Object.freeze(unknownTokenFields),
    cacheSavingsProven:false,
    liveRateVerified:false,providerInvoiceReconciled:false,
    personaQualityVerified:false,productionPromotionAllowed:false,
  });
}
