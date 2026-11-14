/** GEPA-facing metadata-only feedback; never forward private response text or history. */
import {CHARACTER_IDS, digest, validateCorpusSplits} from './contracts-v1.mjs';
const finite01 = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const fail = reason => { throw new Error(`CHARACTER_OPTIMIZATION_EVAL_INVALID:${reason}`); };
export const DIMENSIONS = Object.freeze(['korean_naturalness','response_relevance','agency','persona_fidelity',
  'relationship_fit','continuity','repetition','efficiency']);
export const HARD_GATES = Object.freeze(['fabricated_memory','cross_character_or_user_leak',
  'canon_or_authority_violation','unsupported_relationship','provider_or_cost_violation']);

export function sanitizeGepaFeedback({characterId, scores, hardFailures, uncertainty = false}) {
  if (!CHARACTER_IDS.includes(characterId) || !scores || typeof scores !== 'object'
      || Array.isArray(scores) || Object.keys(scores).sort().join('|') !== [...DIMENSIONS].sort().join('|')
      || DIMENSIONS.some(x => !finite01(scores[x]))) fail('scores');
  if (!Array.isArray(hardFailures) || hardFailures.some(x => !HARD_GATES.includes(x))
      || new Set(hardFailures).size !== hardFailures.length || typeof uncertainty !== 'boolean') fail('hard_gates');
  const blocked = hardFailures.length > 0 || uncertainty;
  const average = DIMENSIONS.reduce((sum, d) => sum + scores[d], 0) / DIMENSIONS.length;
  return Object.freeze({score:blocked?0:average, side_info:{character_id:characterId,
    dimension_scores:{...scores}, failure_codes:[...hardFailures], uncertain:uncertainty,
    review_status:'not_human_approved', raw_dialogue_excluded:true}, hardGatePass:!blocked,
    independentHumanQualityProven:false});
}

/** Mean improvement cannot mask a single character's regression or unknown evaluation. */
export function assessSharedCandidate(rows, {maxRegression = 0} = {}) {
  if (!Array.isArray(rows) || rows.length < 2 || !finite01(maxRegression)) fail('shared_rows');
  const seen=new Set();
  for (const r of rows) {
    if (!r || !CHARACTER_IDS.includes(r.characterId) || seen.has(r.characterId)
        || !finite01(r.baseline) || !finite01(r.candidate)
        || r.hardGatePass !== true || r.humanReviewVerified !== true) {
      return {status:'hold', eligible:false, reason:'missing_independent_character_evidence'};
    }
    seen.add(r.characterId);
  }
  const regressions=rows.filter(r=>r.candidate + maxRegression < r.baseline).map(r=>r.characterId);
  return {status:regressions.length?'rejected':'reviewable', eligible:!regressions.length,
    regressions, overallMeanDelta:rows.reduce((s,r)=>s+r.candidate-r.baseline,0)/rows.length,
    promotionAuthorized:false, evidenceDigest:digest(rows)};
}

export function buildGepaResearchPayload({manifest, candidate, corpus}) {
  if (!manifest || manifest.externalCallsAuthorized !== false || manifest.productionEligible !== false
      || !candidate || candidate.productionEligible !== false || !Array.isArray(corpus)) fail('optimizer_inputs');
  const {manifestSha256, ...manifestBody} = manifest;
  if (manifest.schemaVersion !== 'character-optimization-run-v1' || manifestSha256 !== digest(manifestBody))
    fail('manifest_integrity');
  if (candidate.schemaVersion !== 'character-expression-proposal-v1'
      || candidate.status !== 'pending_owner_review' || candidate.semanticSafetyVerified !== false
      || candidate.textSha256 !== digest(candidate.text)
      || candidate.pinnedContextSha256 !== manifest.immutableSourcesSha256) fail('candidate_integrity');
  const track=manifest.target?.track;
  if ((track==='shared' && candidate.slot!=='shared_expression')
      || (track==='character' && candidate.slot!=='character_expression')
      || !['character','shared'].includes(track)) fail('candidate_track');
  if (corpus.some(x=>!x || !['development','optimizer_validation'].includes(x.split)))
    fail('optimizer_inputs');
  const checked=validateCorpusSplits(corpus,{exposeToOptimizer:true});
  if (!checked.splitCounts.development || !checked.splitCounts.optimizer_validation)
    fail('separate_dev_and_validation_required');
  const expected=track==='character'
    ? [manifest.target.characterId]
    : manifest.target.cohort?.map(x=>x.characterId);
  if (!Array.isArray(expected) || !expected.length || new Set(expected).size !== expected.length
      || expected.some(id=>!CHARACTER_IDS.includes(id))
      || corpus.some(x=>!expected.includes(x.characterId))) fail('cross_character_input');
  // All members of a shared cohort require their own development and validation examples.
  if (expected.some(id=>!['development','optimizer_validation'].every(split=>
      corpus.some(x=>x.characterId===id && x.split===split)))) fail('missing_character_coverage');
  // Only synthetic/approved metadata; raw dialogue, user notes and sealed test cannot cross the process boundary.
  return {schemaVersion:'character-gepa-offline-bridge-v1', optimizer:'gepa',
    runManifestSha256:manifest.manifestSha256, candidateSha256:candidate.textSha256,
    mutableSlot:candidate.slot, dataset:corpus.map(x=>({id:x.id,characterId:x.characterId,
      familyId:x.familyId, split:x.split, contentSha256:x.contentSha256})),
    test_set:null, externalCallsAuthorized:false, productionEligible:false,
    requiresPrivateRuntime:false, qualityGainEstablished:false};
}
