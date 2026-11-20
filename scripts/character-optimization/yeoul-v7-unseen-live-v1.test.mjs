import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('./yeoul-v7-unseen-live-v1.mjs',import.meta.url));
test('v6-v7 study plans nine new cases and never reads private examples',()=>{
 const r=spawnSync(process.execPath,[file,'--plan-only'],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.equal(r.status,0,r.stderr);
 const plan=JSON.parse(r.stdout);
 assert.equal(plan.plannedCalls,18);
 assert.equal(plan.pairs,9);
 assert.equal(plan.privatePromptRequired,false);
 assert.equal(plan.studyVariant,'public_style_no_private_anchors');
 assert.equal(new Set(plan.caseIds).size,9);
});
test('paid calls are blocked without explicit owner approval',()=>{
 const r=spawnSync(process.execPath,[file],{encoding:'utf8',env:{PATH:process.env.PATH}});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/OWNER_PAID_APPROVAL_REQUIRED/);
});
