/**
 * Offline adversarial preflight reconciliation experiment.
 * It never accepts a user turn, authorizes a source, or runs a model.
 * Requires separately obtained classifier decisions and a server Owner check.
 * A second classifier is not free; budget impacts are unmeasured.
 */
const TOPICS=new Set(['family_emotional_history','past_romance_surface','past_romance_detail','deep_vulnerability',null]);
const KINDS=new Set(['USER_SELF_REPORT','CHARACTER_FACT_CLAIM','SHARED_EVENT_CLAIM','RELATIONSHIP_STATUS_CLAIM','THIRD_PARTY_CLAIM','AUTHORITY_OVERRIDE','META_INSTRUCTION']);
function signature(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    !TOPICS.has(raw.topicKey)||!Array.isArray(raw.claimKinds)||
    raw.claimKinds.length>8||raw.claimKinds.some(k=>!KINDS.has(k)))
    return null;
  return JSON.stringify({
    topic:raw.topicKey,
    kinds:[...new Set(raw.claimKinds)].sort(),
  });
}
function decision(status,reason){
  return Object.freeze({status,reason,canGrantPrivateSource:false,
    canSkipOriginalAuthority:false,canSkipSemanticReview:false,
    usableInProduction:false});
}
export function compareSeyeonC03ClassifierDisagreementOfflineV1({unified,independent,ownerEvidence}={}){
  // Owner evidence here is caller-supplied and UNTRUSTED. Never an ACL proof.
  if(!ownerEvidence||ownerEvidence.scope!=='SYNTHETIC_OFFLINE'||
    ownerEvidence.characterId!=='seyeon'||ownerEvidence.sourceSelection!=='zero_only'){
    return decision('HOLD','OWNER_SOURCE_PROOF_NOT_VERIFIED');
  }
  const a=signature(unified),b=signature(independent);
  if(a===null||b===null)return decision('HOLD','INVALID_CLASSIFIER_SHAPE');
  if(a!==b)return decision('HOLD','CLASSIFIER_DISAGREEMENT');
  if(unified.topicKey!==null||unified.claimKinds.length>0)
    return decision('HOLD','SENSITIVE_OR_CLAIM_REQUIRES_OWNER_AUTHORITY');
  return decision('UNVERIFIED','TWO_CLASSIFIERS_AGREE_BUT_MAY_BOTH_BE_WRONG');
}
