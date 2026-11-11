import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const bridge=resolve('scripts/character-optimization/offline-evaluator-bridge.mjs');
test('Node evaluation bridge emits only evidence metadata and never approves',()=>{
  const payload={schemaVersion:'character-optimization-evidence-bridge-v1',evidence:[{
    source:'automated_rule',characterId:'yeoul',scenarioFamilyId:'F01',axisScores:{agency:4},hardFailures:[],
  }]};
  const x=spawnSync(process.execPath,[bridge],{input:JSON.stringify(payload),encoding:'utf8',timeout:5000});
  assert.equal(x.status,0,x.stderr);
  const body=JSON.parse(x.stdout);
  assert.equal(body.modelCalls,0);assert.equal(body.promotionAllowed,false);
  assert.equal(body.reviewState,'insufficient_human_evidence');
});
test('Node evaluation bridge fails closed on raw private message',()=>{
  const payload={schemaVersion:'character-optimization-evidence-bridge-v1',evidence:[{
    source:'automated_rule',characterId:'yeoul',scenarioFamilyId:'F01',axisScores:null,hardFailures:[],
    privateNote:'PRIVATE_DO_NOT_ECHO',
  }]};
  const x=spawnSync(process.execPath,[bridge],{input:JSON.stringify(payload),encoding:'utf8',timeout:5000});
  assert.notEqual(x.status,0);assert.equal(x.stderr,'CHARACTER_OPTIMIZATION_BRIDGE_REJECTED\n');
  assert.doesNotMatch(x.stdout+x.stderr,/PRIVATE_DO_NOT_ECHO/);
});
