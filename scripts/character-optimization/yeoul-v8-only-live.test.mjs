import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./yeoul-v8-only-live.mjs',import.meta.url));
test('nine v8 replies, zero earlier versions',()=>{
 const p=spawnSync(process.execPath,[script,'--plan-only'],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(p.status,0,p.stderr);
 const plan=JSON.parse(p.stdout);
 assert.equal(plan.version,'v8');assert.ok(plan.systemPromptChars<500, 'minimal system prompt exceeded 500 chars');assert.equal(plan.plannedCalls,9);
 assert.equal(plan.previousVersionCalls,0);assert.equal(new Set(plan.caseIds).size,9);
});
test('manual paid approval required',()=>{
 const p=spawnSync(process.execPath,[script],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.notEqual(p.status,0);assert.match(p.stderr,/OWNER_PAID_APPROVAL_REQUIRED/);
});
