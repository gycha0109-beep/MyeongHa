import test from 'node:test';
import assert from 'node:assert/strict';
import { buildYeoulTurnLedger, verifyYeoulTurnEvidence } from './yeoul-turn-ledger-v1.mjs';
const ids = Array.from({length:10},(_,i)=>`H${String(i+1).padStart(2,'0')}`);
const variants = ['baseline','language_rules','conversation_examples','hybrid'];
const turnCounts = Object.fromEntries(ids.map(x=>[x,['H02','H05','H09'].includes(x)?2:1]));
const manifest = {
  schemaVersion:'yeoul-benchmark-preflight-v1',status:'approval_required_not_executable',
  datasetRole:'sealed_holdout_results',holdoutSha256:'a'.repeat(64),modelId:'deepseek/deepseek-v4.1-flash-1017',
  candidateIds:variants,scenarioIds:ids,scenarioTurnCounts:turnCounts,
  scenarioCount:10,scenarioRuns:80,studentModelCallsPlanned:104,repeatsPerScenario:2,
  experimentExecution:{externalCalls:0,approvalRecorded:false,productionChanges:false},
};
const hashes = Object.fromEntries(variants.map((x,i)=>[x, String(i+1).repeat(64)]));
const rows = () => buildYeoulTurnLedger(manifest).steps.map(x=>({
  ...x, datasetRole:'sealed_holdout_results',status:'success',promptSha256:hashes[x.candidateId],
  providerFallbackUsed:false,reply:'합성 응답',elapsedMs:1000,providerReportedCostUsd:0.0001,
}));

test('enumerates exactly 80 trajectories and 104 individual turns without prompt or answer leakage',()=>{
  const p=buildYeoulTurnLedger(manifest);
  assert.equal(p.steps.length,104);assert.equal(new Set(p.steps.map(x=>x.stepKey)).size,104);
  assert.equal(p.steps.filter(x=>x.turn===2).length,24);
  assert.equal(p.externalCalls,0);assert.equal(p.paidExecutionReady,false);
  assert.equal(p.qualityGainEstablished,false);
  assert.ok(!JSON.stringify(p).includes('합성 응답'));
});

test('each second turn references only the preceding same-trajectory turn',()=>{
  const plan=buildYeoulTurnLedger(manifest);const steps=new Map(plan.steps.map(x=>[x.stepKey,x]));
  for(const x of plan.steps.filter(x=>x.turn===2)){
    const prev=steps.get(x.previousStepKey);
    assert.equal(prev.turn,1);assert.equal(prev.candidateId,x.candidateId);
    assert.equal(prev.scenarioId,x.scenarioId);assert.equal(prev.repeat,x.repeat);
  }
});

test('reject altered holdout, missing scenario, altered counts and authorized-looking preflights',()=>{
  assert.throws(()=>buildYeoulTurnLedger({...manifest,scenarioTurnCounts:{...turnCounts,H02:1}}),/unapproved_or_changed_preflight/);
  assert.throws(()=>buildYeoulTurnLedger({...manifest,scenarioRuns:79}),/unapproved_or_changed_preflight/);
  assert.throws(()=>buildYeoulTurnLedger({...manifest,holdoutSha256:'b'}),/unapproved_or_changed_preflight/);
  assert.throws(()=>buildYeoulTurnLedger({...manifest,experimentExecution:{...manifest.experimentExecution,approvalRecorded:true}}),/unapproved_or_changed_preflight/);
});

test('complete synthetic turn evidence is structural only and cannot establish quality gain',()=>{
  const report=verifyYeoulTurnEvidence(manifest,rows(),{reviewedPromptHashes:hashes});
  assert.equal(report.validatedTurnResponses,104);assert.equal(report.validatedScenarioRuns,80);
  assert.equal(report.qualityGainEstablished,false);assert.equal(report.qualityReviewed,false);
  assert.equal(report.productionEligible,false);
});

test('reject omitted, duplicate, swapped or unrecognized turn evidence',()=>{
  const a=rows();const opts={reviewedPromptHashes:hashes};
  assert.throws(()=>verifyYeoulTurnEvidence(manifest,a.slice(1),opts),/incomplete_turn_matrix/);
  assert.throws(()=>verifyYeoulTurnEvidence(manifest,[...a,a[0]],opts),/unknown_or_duplicate_step/);
  assert.throws(()=>verifyYeoulTurnEvidence(manifest,a.map((x,i)=>i===0?{...x,scenarioId:'H09'}:x),opts),/unverified_turn_result/);
  assert.throws(()=>verifyYeoulTurnEvidence(manifest,a.map((x,i)=>i===0?{...x,previousStepKey:'hybrid|H01|1|1'}:x),opts),/unverified_turn_result/);
});

test('reject fallback, wrong prompt, missing reply or forged provenance',()=>{
  const a=rows();const opts={reviewedPromptHashes:hashes};
  for(const change of [{providerFallbackUsed:true},{promptSha256:'f'.repeat(64)},{reply:''},{holdoutSha256:'z'.repeat(64)},{datasetRole:'legacy_development_only'}]){
    assert.throws(()=>verifyYeoulTurnEvidence(manifest,a.map((x,i)=>i===7?{...x,...change}:x),opts),/unverified_turn_result/);
  }
  assert.throws(()=>verifyYeoulTurnEvidence(manifest,a,{reviewedPromptHashes:null}),/frozen_reviewed_prompts_required/);
});
