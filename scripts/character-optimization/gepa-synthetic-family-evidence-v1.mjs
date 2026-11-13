/** Validate synthetic family scores emitted by the real pinned GEPA evaluator.
 * The same evaluator/data are used for optimization, so this is a wiring
 * check, NEVER independent quality validation or a release signal.
 */
import { DIMENSIONS } from './evaluation-v1.mjs';
import { inspectCandidateReviewReadiness } from './candidate-evidence-review-v1.mjs';
import { intakeFrozenGepaResult } from './gepa-result-intake-v1.mjs';

const fail = code => { throw new Error('CHARACTER_GEPA_SYNTHETIC_FAMILY_INVALID:' + code); };
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => plain(x)
  && Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const score = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
const REPORT = [
  'schemaVersion','runManifestSha256','sourceSeedSha256','candidateTextSha256',
  'sourceType','scalarRepeatedAcrossDimensions','independentEvaluation',
  'familyScores','externalCalls','productionEligible',
];
const FAMILY = ['characterId','split','familyId','baselineScore','candidateScore',
  'failureCodes','uncertain'];

export function inspectFrozenSyntheticFamilyEvidence({manifest,envelope,packet,evidence}) {
  const intake = intakeFrozenGepaResult({manifest,packet});
  if (!plain(envelope)
      || envelope.runManifestSha256 !== manifest.manifestSha256
      || envelope.candidateSha256 !== packet.sourceSeedSha256
      || !Array.isArray(envelope.dataset)
      || !exact(evidence,REPORT)
      || evidence.schemaVersion !== 'character-gepa-synthetic-family-evidence-v1'
      || evidence.runManifestSha256 !== manifest.manifestSha256
      || evidence.sourceSeedSha256 !== packet.sourceSeedSha256
      || evidence.candidateTextSha256 !== intake.candidate.textSha256
      || evidence.sourceType !== 'actual_bounded_gepa_evaluator_synthetic_only'
      || evidence.scalarRepeatedAcrossDimensions !== true
      || evidence.independentEvaluation !== false
      || evidence.externalCalls !== 0 || evidence.productionEligible !== false
      || !Array.isArray(evidence.familyScores)
      || evidence.familyScores.length !== envelope.dataset.length)
    fail('untrusted_evidence_header');

  const expected = new Map();
  for(const row of envelope.dataset) {
    if (!plain(row) || !['development','optimizer_validation'].includes(row.split)
        || !intake.characterIds.includes(row.characterId)
        || typeof row.familyId !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}(?![\s\S])/u.test(row.familyId))
      fail('untrusted_envelope_family');
    const id = [row.characterId,row.split,row.familyId].join('|');
    if(expected.has(id)) fail('duplicate_envelope_family');
    expected.set(id,row);
  }
  const seen = new Set(), familyEvaluations=[];
  for(const row of evidence.familyScores) {
    if (!exact(row,FAMILY) || !intake.characterIds.includes(row.characterId)
        || !['development','optimizer_validation'].includes(row.split)
        || typeof row.familyId !== 'string'
        || !score(row.baselineScore) || !score(row.candidateScore)
        || !Array.isArray(row.failureCodes) || row.failureCodes.length !== 0
        || row.uncertain !== false) fail('unsafe_family_score');
    const id = [row.characterId,row.split,row.familyId].join('|');
    if(seen.has(id) || !expected.has(id)) fail('foreign_or_duplicate_family');
    seen.add(id);
    const dimensions = value => Object.fromEntries(DIMENSIONS.map(dim=>[dim,value]));
    familyEvaluations.push({
      characterId:row.characterId, split:row.split, familyId:row.familyId,
      baselineScores:dimensions(row.baselineScore),
      candidateScores:dimensions(row.candidateScore),
      hardFailures:[],uncertainty:false,reviewStatus:'unreviewed',
    });
  }
  if(seen.size !== expected.size) fail('missing_family_score');
  const review = inspectCandidateReviewReadiness({
    manifest,candidate:intake.candidate,familyEvaluations,
  });
  return Object.freeze({
    schemaVersion:'character-gepa-synthetic-family-review-v1',
    manifestSha256:manifest.manifestSha256,
    candidateSha256:intake.candidate.textSha256,
    byCharacter:review.byCharacter,
    scenarioFamiliesChecked:review.scenarioFamiliesChecked,
    hasSyntheticRegressions:review.unverifiedEvidenceWouldFailStrictNoRegression,
    sourceAuthenticated:false,independentHumanQualityProven:false,
    independentEvaluation:false,scalarRepeatedAcrossDimensions:true,
    candidateRegistryStage:'proposed',
    ownerReviewGranted:false,heldoutPassed:false,releaseApproved:false,
    productionEligible:false,externalCalls:0,
  });
}
