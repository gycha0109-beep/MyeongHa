/** Research-only, metadata-only character candidate evaluation & review gate.
 * This is never a trusted evaluation authority or a production promotion API.
 */
import { CHARACTER_IDS, digest } from './contracts-v1.mjs';
import { DIMENSIONS, HARD_GATES } from './evaluation-v1.mjs';

const fail = code => { throw new Error('CHARACTER_CANDIDATE_REVIEW_INVALID:' + code); };
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x);
const score = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const exact = (object, keys) => plain(object)
  && Object.keys(object).sort().join('|') === [...keys].sort().join('|');
const SPLITS = Object.freeze(['development', 'optimizer_validation']);
const ROW_KEYS = Object.freeze([
  'characterId', 'split', 'familyId', 'baselineScores', 'candidateScores',
  'hardFailures', 'uncertainty', 'reviewStatus',
]);

function checkManifestAndCandidate(manifest, candidate) {
  if (!plain(manifest) || manifest.schemaVersion !== 'character-optimization-run-v1'
      || !sha(manifest.manifestSha256) || manifest.externalCallsAuthorized !== false
      || manifest.productionEligible !== false) fail('untrusted_manifest');
  const { manifestSha256, ...body } = manifest;
  if (digest(body) !== manifestSha256) fail('modified_manifest');
  if (!plain(candidate) || candidate.schemaVersion !== 'character-expression-proposal-v1'
      || candidate.status !== 'pending_owner_review' || candidate.productionEligible !== false
      || candidate.semanticSafetyVerified !== false || !sha(candidate.textSha256)
      || typeof candidate.text !== 'string' || digest(candidate.text) !== candidate.textSha256
      || candidate.pinnedContextSha256 !== manifest.immutableSourcesSha256)
    fail('untrusted_candidate');
  if (manifest.target?.track === 'character') {
    if (!CHARACTER_IDS.includes(manifest.target.characterId)
        || candidate.slot !== 'character_expression') fail('character_slot');
    return [manifest.target.characterId];
  }
  if (manifest.target?.track === 'shared') {
    const cohort = manifest.target.cohort;
    if (!Array.isArray(cohort) || cohort.length < 2 || candidate.slot !== 'shared_expression'
        || cohort.some(x => !plain(x) || !CHARACTER_IDS.includes(x.characterId))
        || new Set(cohort.map(x => x.characterId)).size !== cohort.length)
      fail('shared_cohort');
    return cohort.map(x => x.characterId);
  }
  fail('target_track');
}

/**
 * Prepares a privacy-safe quality review report from one aggregated row per
 * character + scenario family. It never counts conversation turns as independent
 * evidence and never unlocks the actual owner/holdout/production gates.
 */
export function inspectCandidateReviewReadiness({manifest, candidate, familyEvaluations}) {
  const expected = checkManifestAndCandidate(manifest, candidate);
  if (!Array.isArray(familyEvaluations) || !familyEvaluations.length)
    fail('missing_family_evidence');
  const families = new Set(), coverage = new Map(expected.map(id => [id, new Set()]));
  const stats = new Map(expected.map(id => [id, {
    characterId:id, developmentFamilies:0, validationFamilies:0,
    hardFailureFamilies:0, uncertaintyFamilies:0, regressionFamilies:0,
    regressionByDimension:Object.fromEntries(DIMENSIONS.map(name => [name,0]))
  }]));
  for (const row of familyEvaluations) {
    if (!exact(row, ROW_KEYS) || !expected.includes(row.characterId)
        || !SPLITS.includes(row.split)
        || typeof row.familyId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/u.test(row.familyId)
        || row.reviewStatus !== 'unreviewed' || typeof row.uncertainty !== 'boolean'
        || !Array.isArray(row.hardFailures)
        || row.hardFailures.some(x => !HARD_GATES.includes(x))
        || new Set(row.hardFailures).size !== row.hardFailures.length)
      fail('private_unverified_or_out_of_scope_evidence');
    for (const scores of [row.baselineScores,row.candidateScores]) {
      if (!exact(scores,DIMENSIONS) || DIMENSIONS.some(d => !score(scores[d])))
        fail('invalid_dimension_scores');
    }
    const familyKey = row.characterId + '|' + row.familyId;
    if (families.has(familyKey)) fail('duplicate_or_cross_split_family');
    families.add(familyKey);
    coverage.get(row.characterId).add(row.split);
    const data = stats.get(row.characterId);
    if (row.split === 'development') data.developmentFamilies++;
    else data.validationFamilies++;
    if (row.hardFailures.length > 0) data.hardFailureFamilies++;
    if (row.uncertainty) data.uncertaintyFamilies++;
    const regressions = DIMENSIONS.filter(dim => row.candidateScores[dim] < row.baselineScores[dim]);
    if (regressions.length) data.regressionFamilies++;
    for (const dimension of regressions) data.regressionByDimension[dimension]++;
  }
  if (expected.some(id => !SPLITS.every(split => coverage.get(id).has(split))))
    fail('each_character_requires_independent_dev_and_validation');
  const summaries = expected.map(id => Object.freeze({
    ...stats.get(id),
    regressionByDimension: Object.freeze({...stats.get(id).regressionByDimension}),
  }));
  const foundFailures = summaries.some(s => s.hardFailureFamilies || s.uncertaintyFamilies
    || s.regressionFamilies);
  return Object.freeze({
    schemaVersion:'character-candidate-evidence-review-v1',
    targetTrack:manifest.target.track,
    characterIds:Object.freeze([...expected]),
    manifestSha256:manifest.manifestSha256,
    candidateSha256:candidate.textSha256,
    candidateMutableSlot:candidate.slot,
    scenarioFamiliesChecked:families.size,
    byCharacter:Object.freeze(summaries),
    evidenceHasReportedRegressionsOrHardFailures:foundFailures,
    unverifiedEvidenceWouldFailStrictNoRegression:foundFailures,
    developmentAndValidationCoverageChecked:true,
    independentHoldoutConsumed:false,
    // Untrusted/research-only numbers are never promoted to quality or owner authority.
    evaluationSourceAuthenticated:false,
    reviewerAuthorityAuthenticated:false,
    independentHumanBlindReviewCompleted:false,
    independentQualityGainEstablished:false,
    ownerReviewGranted:false,
    candidateRegistryStage:'proposed',
    offlineValidated:false, heldoutPassed:false,
    releaseApproved:false, productionEligible:false,
    externalCallsAuthorized:false, externalCalls:0,
    rawDialogueIncluded:false,
    decision:'hold_pending_trusted_evidence_human_review_and_sealed_final_test',
  });
}
