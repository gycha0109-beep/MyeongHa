import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {V5_SYSTEM,V6_SYSTEM,UNSEEN_CASES,makeComparisonUser} from './yeoul-everyday-reaction-v6.mjs';

test('v6 retains v5 identity and all accepted energy examples',()=>{
 const marker='대사의 에너지 예시';
 assert.equal(V6_SYSTEM.split('\n')[0],V5_SYSTEM.split('\n')[0]);
 assert.equal(V6_SYSTEM.slice(V6_SYSTEM.indexOf(marker)),V5_SYSTEM.slice(V5_SYSTEM.indexOf(marker)));
 assert.notEqual(V6_SYSTEM,V5_SYSTEM);
});
test('v6 specifies grounded romantic evidence and everyday reactions',()=>{
 for(const part of ['verifiedEvents','관계','취향','음식·날씨','별로 궁금한 건 아니고','갈등'])
  assert.ok(V6_SYSTEM.includes(part),part);
});
test('nine unseen scenarios keep identical comparison context without forged history',()=>{
 assert.equal(UNSEEN_CASES.length,9);
 assert.equal(new Set(UNSEEN_CASES.map(c=>c.id)).size,9);
 for(const c of UNSEEN_CASES){
  const context=JSON.parse(makeComparisonUser(c));
  assert.equal(context.message,c.message);
  assert.equal(context.relationship,c.relationship);
  assert.deepEqual(context.verifiedEvents,c.verifiedEvents??[]);
  assert.ok(context.referenceContext);
 }
 const unknown=UNSEEN_CASES.find(c=>c.id==='interest_unknown');
 const known=UNSEEN_CASES.find(c=>c.id==='interest_confirmed');
 assert.equal(JSON.parse(makeComparisonUser(unknown)).verifiedEvents.length,0);
 assert.equal(JSON.parse(makeComparisonUser(known)).verifiedEvents.length,1);
});
test('plan-only has zero paid calls and does not require a key',()=>{
 const run=spawnSync(process.execPath,['scripts/character-optimization/yeoul-v6-comparison-live-v1.mjs','--plan-only'],{encoding:'utf8',env:{...process.env,OPENROUTER_API_KEY:'',YEOUL_PAID_APPROVAL:''}});
 assert.equal(run.status,0,run.stderr);
 const plan=JSON.parse(run.stdout);
 assert.equal(plan.plannedCalls,18);
 assert.equal(plan.paidCalls,0);
});
