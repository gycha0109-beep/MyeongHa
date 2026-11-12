import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, createOptimizationRun, validateCandidate } from './contracts-v1.mjs';
import { DIMENSIONS } from './evaluation-v1.mjs';
import { inspectCandidateReviewReadiness } from './candidate-evidence-review-v1.mjs';

const h = digest('synthetic immutable context');
const profile = (characterId, slot) => ({
  characterId,
  source:{canonRef:'synthetic/canon',runtimeRef:'synthetic/runtime',contentBundleSha256:h,
    authorityVersion:'DRAFT_ONLY',authorityState:'DRAFT'},
  student:{provider:'openrouter',modelId:'synthetic/student',parametersSha256:h,routingPolicySha256:h},
  evalSuite:{developmentRef:'synthetic/dev',validationRef:'synthetic/val',holdoutRef:'synthetic/never-readable',
    rubricVersion:'r16-research-only',splitManifestSha256:h},
  mutableSlots:[slot],reviewRequired:true,privacyPolicyRef:'synthetic/no-user-data',
});
const setup = (shared=false) => {
  const manifest = createOptimizationRun({track:shared?'shared':'character',
    profiles:shared?[profile('yeoul','shared_expression'),profile('seyeon','shared_expression')]:
      [profile('yeoul','character_expression')],
    immutableSourcesSha256:h,baselinePromptSha256:h,
    optimizerVersion:'synthetic',evaluatorVersion:'synthetic'});
  const slot = shared?'shared_expression':'character_expression';
  const candidate = validateCandidate({[slot]:'검토 전 합성 표현 문구입니다.'},
    {slot,pinnedContextSha256:h});
  return {manifest,candidate};
};
const scores = n => Object.fromEntries(DIMENSIONS.map(d => [d,n]));
const row = (characterId,split,familyId,baseline=0.5,candidate=0.6) => ({
  characterId,split,familyId,
  baselineScores:scores(baseline),candidateScores:scores(candidate),
  hardFailures:[],uncertainty:false,reviewStatus:'unreviewed',
});
const examples = chars => chars.flatMap(id=>[
  row(id,'development',id+'-dev'),row(id,'optimizer_validation',id+'-val'),
]);

test('one-character aggregate produces metadata-only proposed packet, never owner approval',()=>{
  const {manifest,candidate}=setup(), list=examples(['yeoul']);
  const report=inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:list});
  assert.equal(report.scenarioFamiliesChecked,2);
  assert.equal(report.byCharacter[0].developmentFamilies,1);
  assert.equal(report.byCharacter[0].validationFamilies,1);
  assert.equal(report.evidenceHasReportedRegressionsOrHardFailures,false);
  assert.equal(report.candidateRegistryStage,'proposed');
  assert.equal(report.offlineValidated,false);
  assert.equal(report.ownerReviewGranted,false);
  assert.equal(report.heldoutPassed,false);
  assert.equal(report.externalCalls,0);
  assert.equal(JSON.stringify(report).includes('검토 전 합성'),false);
});

test('each member of a shared cohort has separate development and validation',()=>{
  const {manifest,candidate}=setup(true);
  const report=inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:examples(['yeoul','seyeon'])});
  assert.deepEqual(report.characterIds,['yeoul','seyeon']);
  assert.equal(report.scenarioFamiliesChecked,4);
  assert.equal(report.releaseApproved,false);
  assert.throws(()=>inspectCandidateReviewReadiness({manifest,candidate,
    familyEvaluations:examples(['yeoul','seyeon']).slice(0,3)}),
    /each_character_requires_independent_dev_and_validation/);
});

test('a strong average never masks a regression of one character',()=>{
  const {manifest,candidate}=setup(true), data=examples(['yeoul','seyeon']);
  data[2].candidateScores=scores(0.9);
  data[3].candidateScores=scores(0.3);
  const report=inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:data});
  assert.equal(report.evidenceHasReportedRegressionsOrHardFailures,true);
  assert.equal(report.byCharacter[1].regressionFamilies,1);
  assert.equal(report.byCharacter[1].regressionByDimension.korean_naturalness,1);
  assert.equal(report.candidateRegistryStage,'proposed');
});

test('hard failure and uncertainty are not hidden by positive scores',()=>{
  const {manifest,candidate}=setup(), data=examples(['yeoul']);
  data[0].candidateScores=scores(1);
  data[0].hardFailures=['fabricated_memory'];
  data[1].uncertainty=true;
  const report=inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:data});
  assert.equal(report.byCharacter[0].hardFailureFamilies,1);
  assert.equal(report.byCharacter[0].uncertaintyFamilies,1);
  assert.equal(report.unverifiedEvidenceWouldFailStrictNoRegression,true);
  assert.equal(report.offlineValidated,false);
});

test('a family cannot be duplicated or straddle the two partitions',()=>{
  const {manifest,candidate}=setup(), data=examples(['yeoul']);
  data[1].familyId=data[0].familyId;
  assert.throws(()=>inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:data}),
    /duplicate_or_cross_split_family/);
});

test('sealed holdout, private user text, unapproved scores and invented characters are refused',()=>{
  const {manifest,candidate}=setup(), data=examples(['yeoul']);
  for(const field of [
    {...data[0],split:'sealed_holdout'},
    {...data[0],userText:'PRIVATE_USER_DIALOGUE'},
    {...data[0],reviewStatus:'approved'},
    {...data[0],characterId:'seyeon'},
    {...data[0],baselineScores:{...data[0].baselineScores, agency:2}},
  ]) {
    assert.throws(()=>inspectCandidateReviewReadiness({manifest,candidate,
      familyEvaluations:[field,data[1]]}));
  }
});

test('family evaluation metadata rejects final newline, raw text and paths',()=>{
  const {manifest,candidate}=setup(), data=examples(['yeoul']);
  for(const familyId of ['valid\\n','사적인 대화 원문','../private','family|leak','a'.repeat(101)]){
    assert.throws(()=>inspectCandidateReviewReadiness({manifest,candidate,
      familyEvaluations:[{...data[0],familyId},data[1]]}),
    /private_unverified_or_out_of_scope_evidence/);
  }
});

test('run and candidate hashes, context and allowed expression slot must match',()=>{
  const {manifest,candidate}=setup(), data=examples(['yeoul']);
  assert.throws(()=>inspectCandidateReviewReadiness({manifest:{...manifest,optimizerVersion:'changed'},
    candidate,familyEvaluations:data}),/modified_manifest/);
  assert.throws(()=>inspectCandidateReviewReadiness({manifest,
    candidate:{...candidate,text:'changed'},familyEvaluations:data}),/untrusted_candidate/);
  assert.throws(()=>inspectCandidateReviewReadiness({manifest,
    candidate:{...candidate,slot:'shared_expression'},familyEvaluations:data}),/character_slot/);
});

test('extra duplicate hard gates and non-exact dimension schema are refused',()=>{
  const {manifest,candidate}=setup(), data=examples(['yeoul']);
  data[0].hardFailures=['fabricated_memory','fabricated_memory'];
  assert.throws(()=>inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:data}),
    /private_unverified_or_out_of_scope_evidence/);
  data[0].hardFailures=[];
  data[0].candidateScores={...data[0].candidateScores, extraScore:0.9};
  assert.throws(()=>inspectCandidateReviewReadiness({manifest,candidate,familyEvaluations:data}),
    /invalid_dimension_scores/);
});
