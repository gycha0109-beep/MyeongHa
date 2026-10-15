/**
 * COST-02/04: PURE offline dual-prompt comparison of review-only classifier
 * outputs. No provider, billing, credentials, models, network, DB or authority.
 * A fixture can spoof an "ideal" answer; no score can prove live reliability.
 */
import { SEYEON_COST_C02_ALL_GOLD_V1 } from './seyeon-cost-c02-authored-gold-v1.mjs';
import { scoreSeyeonClassifierCaseV1, aggregateSeyeonEvalV1 } from './seyeon-model-eval-cases-v1.mjs';

export const SEYEON_C04_PAIRWISE_SCORE_VERSION_V1 =
  'seyeon-cost-c04-pairwise-quality-review-v1';
export const SEYEON_C04_PAIRWISE_VARIANTS_V1 =
  Object.freeze(['baseline','compact']);
const GOLD = new Map(SEYEON_COST_C02_ALL_GOLD_V1.map(g => [g.id,g]));
const TOPICS = new Set([null,'family_emotional_history',
  'past_romance_surface','past_romance_detail','deep_vulnerability']);
const KINDS = new Set(['USER_SELF_REPORT','CHARACTER_FACT_CLAIM',
  'SHARED_EVENT_CLAIM','RELATIONSHIP_STATUS_CLAIM',
  'AUTHORITY_OVERRIDE','META_INSTRUCTION']);
const KEYS = ['caseId','variant','outcome','topicKey','claimKinds','serializedRequestBytes'];
function validInt(x,min=0){return Number.isSafeInteger(x)&&x>=min;}
function safeSum(rows) {
  const value=rows.reduce((sum,x)=>sum+BigInt(x.serializedRequestBytes),0n);
  if(value>BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('C04 pairwise bytes exceed safe integer range');
  return Number(value);
}
function checkRow(row) {
  if(!row||typeof row!=='object'||Array.isArray(row)||
      Object.keys(row).length!==KEYS.length||
      !KEYS.every(k=>Object.hasOwn(row,k))||
      !GOLD.has(row.caseId)||
      !SEYEON_C04_PAIRWISE_VARIANTS_V1.includes(row.variant)||
      (row.outcome!=='ok'&&row.outcome!=='error')||
      !validInt(row.serializedRequestBytes,1)||
      !Array.isArray(row.claimKinds)||row.claimKinds.length>8||
      row.claimKinds.some(k=>!KINDS.has(k))||
      new Set(row.claimKinds).size!==row.claimKinds.length||
      !TOPICS.has(row.topicKey)) {
    throw new TypeError('C04 invalid or unbounded classifier evidence');
  }
  if(row.outcome==='error'&&(row.topicKey!==null||row.claimKinds.length!==0))
    throw new TypeError('C04 failed attempt must not supply predictions');
}
/**
 * The C02 gold describes a REQUIRED kind, not all permissible claims.
 * Additional kinds are unreviewed evidence, not necessarily false positives.
 * Never call such a row clean without an explicit second-person review.
 */
function hasUnreviewedClaimKinds(spec,row) {
  if(row.claimKinds.length===0) return false;
  if(spec.noClaims===true) return false; // already gold-labelled no claims
  if(spec.requiredKind!==undefined)
    return row.claimKinds.some(kind=>kind!==spec.requiredKind);
  return true; // no claim-kind label: never infer approval for extra claims
}
function compareKinds(row){
  return [...row.claimKinds].sort().join('|');
}
function analyze(ordered) {
  const scored=[];
  const errors=[];
  const unreviewedClaimIds=[];
  for(const [spec,row] of ordered) {
    if(!row){errors.push(spec.id);continue;}
    if(row.outcome!=='ok'){errors.push(spec.id);continue;}
    scored.push(scoreSeyeonClassifierCaseV1(spec,
      {claims:row.claimKinds.map(kind=>({kind}))},
      {topicKey:row.topicKey}));
    if(hasUnreviewedClaimKinds(spec,row))
      unreviewedClaimIds.push(spec.id);
  }
  const aggregate=aggregateSeyeonEvalV1(scored);
  const defects=scored.filter(x=>!x.topicMatch ||
    x.requiredKindFound===false || x.noClaimsViolated===true);
  return Object.freeze({
    ...aggregate,unscoredOrFailedIds:Object.freeze(errors),
    defectIds:Object.freeze(defects.map(x=>x.id)),
    // These are unresolved annotations, not established model mistakes.
    unreviewedClaimIds:Object.freeze(unreviewedClaimIds),
    goldComplete:errors.length===0&&scored.length===GOLD.size,
    zeroGoldDefects:errors.length===0&&defects.length===0&&scored.length===GOLD.size,
  });
}
/** reviewInput is untrusted offline evidence; even perfect labels HOLD live deployment. */
export function scoreSeyeonC04PairwiseOfflineV1(reviewInput) {
  if(!reviewInput||reviewInput.scope!=='SYNTHETIC_OR_UNVERIFIED_CAPTURE'||
      !Array.isArray(reviewInput.rows)||
      reviewInput.rows.length>GOLD.size*2)
    throw new TypeError('C04 invalid review envelope');
  const byKey=new Map();
  for(const row of reviewInput.rows) {
    checkRow(row);
    const key=row.variant+':'+row.caseId;
    if(byKey.has(key)) throw new Error('C04 duplicate classifier sample');
    byKey.set(key,row);
  }
  const gold=[...GOLD.values()];
  const ordered=(variant)=>gold.map(spec=>[spec,byKey.get(variant+':'+spec.id)]);
  const baselineRows=ordered('baseline'),compactRows=ordered('compact');
  const baseline=analyze(baselineRows),compact=analyze(compactRows);
  const disagreements=[],regressions=[];
  for(const spec of gold) {
    const a=byKey.get('baseline:'+spec.id);
    const b=byKey.get('compact:'+spec.id);
    if(!a||!b||a.outcome!=='ok'||b.outcome!=='ok')continue;
    // Claim arrays are unordered sets for this *review* comparison.
    // Sort to avoid a false disagreement from a harmless permutation.
    if(a.topicKey!==b.topicKey||
        compareKinds(a)!==compareKinds(b)) {
      disagreements.push(spec.id);
    }
    const aScore=scoreSeyeonClassifierCaseV1(spec,
      {claims:a.claimKinds.map(kind=>({kind}))},{topicKey:a.topicKey});
    const bScore=scoreSeyeonClassifierCaseV1(spec,
      {claims:b.claimKinds.map(kind=>({kind}))},{topicKey:b.topicKey});
    const safe=x=>x.topicMatch&&x.requiredKindFound!==false&&x.noClaimsViolated!==true;
    if(safe(aScore)&&!safe(bScore)) regressions.push(spec.id);
  }
  const complete=baseline.goldComplete&&compact.goldComplete;
  const baselineBytes=complete?safeSum(baselineRows.map(x=>x[1])):null;
  const compactBytes=complete?safeSum(compactRows.map(x=>x[1])):null;
  const savedBytes=complete?baselineBytes-compactBytes:null;
  const hardFailures=[
    ...(!complete?['INCOMPLETE_OR_FAILED_CASES']:[]),
    ...(!baseline.zeroGoldDefects?['BASELINE_GOLD_DEFECT']:[]),
    ...(!compact.zeroGoldDefects?['COMPACT_GOLD_DEFECT']:[]),
    ...((baseline.unreviewedClaimIds.length||compact.unreviewedClaimIds.length)
      ?['UNREVIEWED_CLAIM_KIND_REQUIRES_OWNER_LABEL']:[]),
    ...(regressions.length?['COMPACT_REGRESSION']:[]),
    ...(complete&&savedBytes<=0?['NO_REQUEST_BYTE_REDUCTION']:[]),
  ];
  return Object.freeze({
    schemaVersion:SEYEON_C04_PAIRWISE_SCORE_VERSION_V1,
    scope:'UNVERIFIED_OFFLINE_CLASSIFIER_SCORES',
    expectedCaseCount:GOLD.size,
    observedRows:reviewInput.rows.length,
    baseline,compact,
    disagreementIds:Object.freeze(disagreements),
    regressionIds:Object.freeze(regressions),
    baselineSerializedBytes:baselineBytes,
    compactSerializedBytes:compactBytes,
    savedSerializedBytes:savedBytes,
    hardFailureCodes:Object.freeze(hardFailures),
    offlineGoldAndByteChecksPass:hardFailures.length===0,
    realModelRecallVerified:false,
    realModelFalsePositiveRateVerified:false,
    providerReceiptsVerified:false,
    paidEvaluationPermitted:false,
    productionPromotionPermitted:false,
    verdict:'HOLD_REAL_MODEL_AND_OWNER_REVIEW',
  });
}
