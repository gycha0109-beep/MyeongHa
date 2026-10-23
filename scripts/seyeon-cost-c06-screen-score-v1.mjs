/**
 * Offline, provider-agnostic case scorer for the C06 paid-screen evidence.
 * Preserves rather than hides unexpected claim kinds. No network or authority.
 */
export function scoreSeyeonC06ScreenCaseV1(spec, observed) {
  if(!spec||typeof spec.id!=='string'||
     !Object.hasOwn(spec,'topic')||
     !observed||!Object.hasOwn(observed,'topicKey')||
     !Array.isArray(observed.claimKinds)||
     observed.claimKinds.some(kind=>typeof kind!=='string'||!kind)){
    throw new TypeError('C06 bounded score inputs required');
  }
  const kinds=[...new Set(observed.claimKinds)];
  const topicMatch=observed.topicKey===spec.topic;
  const requiredClaimFound=spec.requiredKind===undefined?null:
    kinds.includes(spec.requiredKind);
  const ordinaryClaimViolation=spec.noClaims===true&&kinds.length>0;
  const unreviewedClaimKinds=spec.noClaims===true?[]:
    spec.requiredKind===undefined?kinds:
      kinds.filter(kind=>kind!==spec.requiredKind);
  return Object.freeze({
    caseId:spec.id,expectedTopic:spec.topic,
    observedTopic:observed.topicKey,topicMatch,
    requiredClaimFound,ordinaryClaimViolation,
    unreviewedClaimKinds,claimKinds:kinds,
    candidateGoldCheck:topicMatch&&requiredClaimFound!==false&&
      !ordinaryClaimViolation&&unreviewedClaimKinds.length===0
      ?'MATCHED_GOLD_SCREEN':'REVIEW_OR_DEFECT_HOLD',
  });
}
