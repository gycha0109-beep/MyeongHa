import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from './contracts-v1.mjs';
import {makeNewYeoulScenarioPlan, YEOUL_NEW_FAMILY_DRAFTS,
        admitNewYeoulScenarioToOptimizer} from './yeoul-new-scenario-families-v1.mjs';

test('new draft development and validation families are separate and unpublished as evaluator results',()=>{
  const plan=makeNewYeoulScenarioPlan();
  assert.equal(plan.splitCounts.development,4);
  assert.equal(plan.splitCounts.optimizer_validation,4);
  assert.equal(plan.metadata.length,8);
  assert.equal(new Set(plan.metadata.map(x=>x.familyId)).size,8);
  assert.equal(plan.humanReviewApproved,false);
  assert.equal(plan.independentQualityEvidence,false);
  assert.equal(plan.optimizerInputReady,false);
  assert.equal(plan.modelCallsAuthorized,false);
  assert.equal(plan.oldY01toY12Compared,false);
  assert.equal(plan.syntheticCrossSplitLexicalScreen.lexicalScreenPassed,true);
  assert.equal(plan.syntheticCrossSplitLexicalScreen.crossSplitFamilyPairsChecked,16);
  assert.equal(plan.syntheticCrossSplitLexicalScreen.possibleOverlapCount,0);
  assert.equal(plan.syntheticCrossSplitLexicalScreen.semanticIndependenceVerified,false);
  assert.equal(plan.syntheticCrossSplitLexicalScreen.optimizerAdmissionAuthorized,false);
  assert.equal(plan.metadata.every(x=>x.characterId==='yeoul'),true);
  assert.equal(JSON.stringify(plan).includes('답장을 안 했대요'),false);
  assert.deepEqual(plan,makeNewYeoulScenarioPlan());
});

test('known exact exposed sentence and bad digest are denied',()=>{
  const existing=digest(YEOUL_NEW_FAMILY_DRAFTS[0].turns[0].trim().normalize('NFKC'));
  assert.throws(()=>makeNewYeoulScenarioPlan({knownExactTurnHashes:[existing]}),
                /known_exact_exposure/);
  assert.throws(()=>makeNewYeoulScenarioPlan({knownExactTurnHashes:['no']}),/known_digests_shape/);
});

test('private historical overlap and approval are mandatory, not silently inferred',()=>{
  assert.throws(()=>admitNewYeoulScenarioToOptimizer(),/private_semantic_overlap_review_missing/);
});
