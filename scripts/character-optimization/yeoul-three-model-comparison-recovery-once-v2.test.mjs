import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const v1=join(here,'yeoul-three-model-comparison-once-v1.mjs');
const v2=join(here,'yeoul-three-model-comparison-recovery-once-v2.mjs');
function plan(path){
  const r=spawnSync(process.execPath,[path,'--plan-only'],{encoding:'utf8',timeout:10000,
    env:{PATH:process.env.PATH}});
  assert.equal(r.status,0,r.stderr);
  const line=r.stdout.trim();
  assert.match(line,/^BENCH_PLAN /);
  return JSON.parse(line.slice('BENCH_PLAN '.length));
}
test('recovery preserves exactly the original synthetic benchmark questions',()=>{
  const a=plan(v1),b=plan(v2);
  assert.equal(a.promptSha256,b.promptSha256);
  assert.deepEqual(a.models,b.models);
  assert.equal(b.totalMaxReplies,117);
  assert.equal(b.questions,20);
  assert.equal(b.multiTurns,10);
  assert.equal(b.repeats,9);
});
test('recovery counts prior hold and bounds its paid execution',()=>{
  const b=plan(v2);
  assert.equal(b.previousRunHeldKrw,14);
  assert.equal(b.capKrw,500);
  assert.ok(b.newRunLimitKrw+b.previousRunHeldKrw<500);
  assert.ok(b.outputTokenAccountingCap>b.outputTokenRequestCap);
});
test('recovery uses its own one-shot workflow and requires non-reasoning Grok',()=>{
  const code=readFileSync(v2,'utf8');
  assert.match(code,/yeoul-three-model-comparison-recovery-once-v2\.yml/);
  assert.match(code,/reasoning:\{effort:'none'\}/);
  assert.match(code,/previousRunHeldKrw:PREVIOUS_RESERVED_KRW/);
  assert.match(code,/usageExceededAccountingCap/);
  assert.match(code,/runSpentKrw\+triple/);
});
