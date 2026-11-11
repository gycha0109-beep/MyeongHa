import { HARD_FAILURES, QUALITY_AXES, fail, keys } from './contracts.mjs';

const SOURCES = ['owner_rating', 'reviewer_blind', 'automated_rule', 'ai_judge'];
const FIELDS = ['source', 'characterId', 'scenarioFamilyId', 'axisScores', 'hardFailures'];

export function validateEvaluationEvidence(records) {
  if (!Array.isArray(records)) fail('evaluation', 'array required');
  const sources = Object.fromEntries(SOURCES.map(s => [s,0]));
  const violations=[];
  for (const r of records) {
    keys(r, FIELDS, FIELDS, 'evaluation.record');
    if (!SOURCES.includes(r.source)) fail('evaluation.source', 'unknown evidence source');
    if (typeof r.characterId !== 'string' || typeof r.scenarioFamilyId !== 'string') fail('evaluation.identity', 'missing scope');
    if (r.axisScores !== null) {
      keys(r.axisScores, QUALITY_AXES, [], 'evaluation.axisScores');
      for (const [axis, value] of Object.entries(r.axisScores)) if (!Number.isFinite(value) || value < 0 || value > 5) fail(`evaluation.${axis}`, 'score must be 0..5');
    }
    if (!Array.isArray(r.hardFailures) || !r.hardFailures.every(x => HARD_FAILURES.includes(x)) || new Set(r.hardFailures).size !== r.hardFailures.length) fail('evaluation.hardFailures', 'invalid/duplicate failure');
    sources[r.source] += 1;
    if (r.hardFailures.length) violations.push({source:r.source, characterId:r.characterId, scenarioFamilyId:r.scenarioFamilyId, codes:[...r.hardFailures]});
  }
  return Object.freeze({sourceCounts:Object.freeze(sources), hardFailureCount:violations.length, violations:Object.freeze(violations), humanQualityVerified:sources.reviewer_blind>0, automaticallyApproved:false});
}

export function assessCandidateForOwnerReview(records) {
  const result = validateEvaluationEvidence(records);
  return Object.freeze({
    state:result.hardFailureCount ? 'blocked_hard_failure' : result.humanQualityVerified ? 'eligible_for_owner_review' : 'insufficient_human_evidence',
    promotionAllowed:false, reason:result.hardFailureCount ? 'hard failure present' : 'owner approval and sealed holdout still required',
  });
}
