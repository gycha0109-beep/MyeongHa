import { fail, keys } from './contracts.mjs';

/** Gate by character, not by average; uncertain/unsupported characters never pass. */
export function evaluateSharedCandidateRegression(entries, thresholds) {
  if (!Array.isArray(entries) || entries.length < 2) fail('regression.entries', 'two or more characters required');
  keys(thresholds, ['minimumScore','maximumDrop','minimumFamilies'], ['minimumScore','maximumDrop','minimumFamilies'], 'regression.thresholds');
  for (const f of ['minimumScore','maximumDrop']) if (!Number.isFinite(thresholds[f]) || thresholds[f]<0 || thresholds[f]>5) fail(`regression.thresholds.${f}`, 'invalid threshold');
  if (!Number.isSafeInteger(thresholds.minimumFamilies) || thresholds.minimumFamilies<1) fail('regression.thresholds.minimumFamilies', 'invalid family count');
  const seen=new Set(); const decisions=[];
  for (const x of entries) {
    keys(x, ['characterId','baseline','candidate','independentFamilies','hardFailures','humanReviewed'], ['characterId','baseline','candidate','independentFamilies','hardFailures','humanReviewed'], 'regression.entry');
    if (typeof x.characterId!=='string' || seen.has(x.characterId)) fail('regression.characterId', 'duplicate/invalid');
    seen.add(x.characterId);
    for (const f of ['baseline','candidate']) if (!Number.isFinite(x[f]) || x[f]<0 || x[f]>5) fail(`regression.${f}`, 'invalid score');
    if (!Number.isSafeInteger(x.independentFamilies) || x.independentFamilies<0 || !Number.isSafeInteger(x.hardFailures) || x.hardFailures<0 || typeof x.humanReviewed!=='boolean') fail('regression.evidence', 'invalid input');
    const reasons=[];
    if (x.independentFamilies < thresholds.minimumFamilies) reasons.push('insufficient_independent_families');
    if (!x.humanReviewed) reasons.push('not_human_reviewed');
    if (x.hardFailures>0) reasons.push('hard_failure');
    if (x.candidate < thresholds.minimumScore) reasons.push('below_minimum_quality');
    if (x.baseline-x.candidate>thresholds.maximumDrop) reasons.push('character_regression');
    decisions.push(Object.freeze({characterId:x.characterId, pass:reasons.length===0, reasons:Object.freeze(reasons)}));
  }
  return Object.freeze({allCharactersPass:decisions.every(x=>x.pass), deploymentApproved:false, decisions:Object.freeze(decisions)});
}
