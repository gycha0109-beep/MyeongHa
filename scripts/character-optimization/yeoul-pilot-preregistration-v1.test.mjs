import test from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS } from './evaluation-v1.mjs';
import { inspectYeoulPilotPreregistrationDraft } from './yeoul-pilot-preregistration-v1.mjs';
import { makeYeoulPilotReadiness } from './yeoul-pilot-readiness-v1.mjs';

// Synthetic example values exist only in this test: never owner-approved thresholds.
const synthetic = () => ({
  schemaVersion:'yeoul-gepa-pilot-criteria-draft-v1',
  characterId:'yeoul', evaluationUnit:'independent_scenario_family',
  holdout:{source:'new_unexposed_private',minimumFamilies:6,
    publicH01H10Excluded:true,developmentAndValidationExcluded:true},
  blindReview:{mode:'paired_blind',minimumRaters:2,minimumPreferenceShare:0.6,
    ties:'not_a_win'},
  regression:{dimensions:[...DIMENSIONS],allCharactersMustPass:true,
    anyDimensionVeto:true,hardFailureVeto:true,uncertaintyVeto:true},
  stop:{totalBudgetKrw:500,includeAllRolesAndRetries:true,
    unreconciledCharge:'stop',providerMismatch:'stop',sealedLeakage:'stop'},
});

test('synthetic well-formed criteria draft remains HOLD and never counts as owner approval',()=>{
  const input=synthetic();
  const result=inspectYeoulPilotPreregistrationDraft(input);
  assert.match(result.criteriaDraftSha256,/^[0-9a-f]{64}$/u);
  assert.equal(result.maximumTotalKrw,500);
  assert.equal(result.minimumHoldoutFamilies,6);
  assert.equal(result.ownerCriteriaApprovalVerified,false);
  assert.equal(result.preregistrationImmutablyTimestamped,false);
  assert.equal(result.independentPrivateHoldoutVerified,false);
  assert.equal(result.realQualityImprovementEstablished,false);
  assert.equal(result.paidExecutionReady,false);
  assert.equal(result.externalCalls,0);
  const readiness=makeYeoulPilotReadiness({criteriaDraft:input});
  assert.equal(readiness.criteriaDraftReceived,true);
  assert.equal(readiness.criteriaDraftSha256,result.criteriaDraftSha256);
  assert.equal(readiness.criteriaOwnerApproved,false);
  assert.equal(readiness.criteriaImmutablyPreregistered,false);
  assert.equal(readiness.paidExecutionReady,false);
  assert.ok(readiness.outstanding.includes('owner_review_and_immutable_preregistration_before_trial'));
});

test('missing draft makes an explicit readiness gap, never a default threshold',()=>{
  const readiness=makeYeoulPilotReadiness();
  assert.equal(readiness.criteriaDraftReceived,false);
  assert.equal(readiness.criteriaDraftSha256,null);
  assert.ok(readiness.outstanding.includes('pilot_success_stop_nonregression_rules_draft'));
  assert.equal(readiness.paidExecutionReady,false);
});

test('all quality dimensions and stop conditions must be present and unchanged',()=>{
  for(const change of [
    p=>{p.regression.dimensions.pop();},
    p=>{p.regression.dimensions[0]='persona_fidelity';},
    p=>{p.regression.anyDimensionVeto=false;},
    p=>{p.regression.uncertaintyVeto=false;},
    p=>{p.stop.totalBudgetKrw=501;},
    p=>{p.stop.includeAllRolesAndRetries=false;},
    p=>{p.stop.unreconciledCharge='continue';},
    p=>{p.stop.providerMismatch='continue';},
    p=>{p.stop.sealedLeakage='continue';},
  ]){
    const candidate=synthetic();change(candidate);
    assert.throws(()=>inspectYeoulPilotPreregistrationDraft(candidate),
      /YEOUL_PILOT_CRITERIA_INVALID/u);
  }
});

test('no publicly exposed or prior optimizer families can be called a fresh holdout',()=>{
  for(const change of [
    p=>{p.holdout.publicH01H10Excluded=false;},
    p=>{p.holdout.developmentAndValidationExcluded=false;},
    p=>{p.holdout.source='public_H01_H10';},
    p=>{p.evaluationUnit='model_response_turn';},
    p=>{p.blindReview.mode='self_review';},
    p=>{p.blindReview.ties='win';},
    p=>{p.blindReview.minimumPreferenceShare=NaN;},
    p=>{p.holdout.minimumFamilies=0;},
  ]){
    const candidate=synthetic();change(candidate);
    assert.throws(()=>inspectYeoulPilotPreregistrationDraft(candidate),
      /YEOUL_PILOT_CRITERIA_INVALID/u);
  }
});

test('unrecognized source text, raw dialogue and forged approval are never exported',()=>{
  const draft=synthetic();
  draft.privateDialogue='This is a synthetic-only private prompt placeholder';
  assert.throws(()=>inspectYeoulPilotPreregistrationDraft(draft),/scope_or_shape/u);
  const extra=synthetic();
  extra.ownerApprovalVerified=true;
  assert.throws(()=>makeYeoulPilotReadiness({criteriaDraft:extra}),/scope_or_shape/u);
  const a=synthetic(),b=synthetic();
  b.blindReview.minimumPreferenceShare=0.7;
  assert.notEqual(inspectYeoulPilotPreregistrationDraft(a).criteriaDraftSha256,
    inspectYeoulPilotPreregistrationDraft(b).criteriaDraftSha256);
});
