import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { IMMUTABLE_KEYS, sha256 } from '../src/index.mjs';
const H = x => x.repeat(64);
const CLI=resolve(import.meta.dirname ?? new URL('.', import.meta.url).pathname,'../validate-offline-manifest.mjs');
function makeInput() {
  const dir=mkdtempSync(join(tmpdir(),'myeongha-gepa-contract-'));
  const characterId='yeoul';
  const p={target:{characterId,canonRef:'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',runtimeRef:'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',contentBundleSha256:H('a'),authorityVersion:'draft-v1',authorityState:'DRAFT',student:{provider:'openrouter',modelId:'deepseek/deepseek-v4.1-flash-1017',parametersSha256:H('b'),routingPolicySha256:H('c')},evalSuite:{developmentRef:'synthetic://yeoul/development',validationRef:'synthetic://yeoul/validation',holdoutRef:'private://yeoul/sealed',rubricVersion:'v1',splitManifestSha256:H('d')}},immutableContextKeys:[...IMMUTABLE_KEYS],mutableSlots:['character_expression'],privacyPolicyRef:'docs/character-optimization/EXPERIMENT_POLICY.md',reviewRequired:true};
  const r={runId:'synthetic-run',target:{track:'character',characterId},immutableSourcesSha256:H('1'),baselinePromptSha256:H('2'),datasetManifestSha256:H('3'),optimizerName:'gepa',optimizerVersion:'not-installed',pythonEnvironmentSha256:H('4'),optimizerConfigSha256:H('5'),evaluatorVersion:'v1',reflectionModelId:'disabled/no-network',maxStudentCalls:0,maxReflectionCalls:0,maxJudgeCalls:0,maxHoldoutCalls:0,maxApiAttempts:0,maxConcurrency:0,maxTotalSpendUsd:0,maximumRequestTokensByRole:Object.fromEntries(['student','reflection','judge','holdout'].map(x=>[x,{input:0,output:0}])),stopOnUnknownUsage:true,sealedHoldoutOutsideGepa:true,privateRunDirectoryRef:'unavailable',budgetLedgerRef:'unavailable',executionMode:'offline'};
  const d=[{recordId:'synthetic1',characterId,familyId:'F01',paraphraseFamilyId:'F01',turnGroupId:'F01',promptFingerprint:sha256('synthetic payload'),role:'development',sourceKind:'synthetic'}];
  const paths=[join(dir,'run.json'),join(dir,'profiles.json'),join(dir,'dataset.json')];
  for (const [i,value] of [[0,r],[1,[p]],[2,d]]) writeFileSync(paths[i],JSON.stringify(value));
  return {dir,paths,d};
}
test('offline preflight emits hashes/counts without private text or paid calls',()=>{
  const o=makeInput();
  try {
    const process=spawnSync(globalThis.process.execPath,[CLI,...o.paths],{encoding:'utf8',timeout:8000,env:{PATH:'/usr/bin:/bin'}});
    assert.equal(process.status,0,process.stderr);
    const response=JSON.parse(process.stdout);
    assert.equal(response.externalCalls,0);assert.equal(response.productionChanges,false);
    assert.equal(response.developmentCount,1);
    assert.equal(process.stdout.includes('synthetic payload'),false);
    assert.equal(response.qualityImprovementProven,false);
  } finally {rmSync(o.dir,{recursive:true,force:true});}
});
test('offline preflight refuses sealed holdout metadata',()=>{
  const o=makeInput();
  try {
    const extra={...o.d[0],recordId:'heldout',familyId:'F02',paraphraseFamilyId:'F02',turnGroupId:'F02',promptFingerprint:sha256('sealed payload'),role:'sealed_holdout'};
    writeFileSync(o.paths[2],JSON.stringify([...o.d,extra]));
    const result=spawnSync(globalThis.process.execPath,[CLI,...o.paths],{encoding:'utf8',timeout:8000});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/does not admit sealed/);
    assert.doesNotMatch(result.stderr,/sealed payload/);
  } finally {rmSync(o.dir,{recursive:true,force:true});}
});
