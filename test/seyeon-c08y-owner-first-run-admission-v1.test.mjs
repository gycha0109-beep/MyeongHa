import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertSeyeonC08YOwnerFirstRunV1 as admit} from
 '../scripts/seyeon-c08y-owner-first-run-admission-v1.mjs';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P} from
 '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';
const id='39199000001',sha='a'.repeat(40);
const ctx={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
 GITHUB_RUN_ID:id,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{
 id:Number(id),event:'workflow_dispatch',head_branch:'main',head_sha:sha,
 run_attempt:1}]};
const main={object:{sha}};
describe('one-shot KEY2 six real Gold dispatch boundary (CI never calls the API)',()=>{
 it('accepts only the first exact current-main run',()=>{
  expect(admit(ctx,history,main)).toEqual({
   scope:'ONE_BOUNDED_REAL_BATCH',runId:id,mainSha:sha});
 });
 it('rejects reruns, stale main, other repos, events and duplicate runs',()=>{
  for(const env of [
   {...ctx,GITHUB_RUN_ATTEMPT:'2'},
   {...ctx,GITHUB_REF:'refs/heads/release'},
   {...ctx,GITHUB_EVENT_NAME:'push'},
   {...ctx,GITHUB_REPOSITORY:'other/repo'},
  ])expect(()=>admit(env,history,main)).toThrow();
  for(const stale of [
   {...history,total_count:2},
   {...history,workflow_runs:[]},
   {...history,workflow_runs:[{...history.workflow_runs[0],head_sha:'b'.repeat(40)}]},
  ])expect(()=>admit(ctx,stale,main)).toThrow();
  expect(()=>admit(ctx,history,{object:{sha:'b'.repeat(40)}})).toThrow();
 });
 it('pins the unused six slots and conservative 5000 KRW budget',()=>{
  expect(P.caseIds).toEqual(['A01','H01','C02_mixed-admin-private_01']);
  expect(P.variants).toEqual(['original','compact']);
  expect(P.maxFirstBatchCalls).toBe(6);
  expect(P.firstBatchReservedMicroUsd).toBe(19662);
  expect(P.additionalBudgetKrw).toBe(5000);
  expect(P.firstBatchReservedKrw).toBeLessThan(5000);
  expect(P.maxOutputTokens).toBe(1024);
  expect(P.maxBodyBytes).toBe(6144);
 });
 it('manual one-shot, pinned model and existing eval key are enforced',()=>{
  const y=readFileSync(new URL('../.github/workflows/seyeon-c08y-owner-paid-six-v1.yml',import.meta.url),'utf8');
  const s=readFileSync(new URL('../scripts/run-seyeon-c08y-owner-paid-six-v1.mjs',import.meta.url),'utf8');
  expect(y).toContain('  workflow_dispatch:');
  expect(y).toContain("github.ref == 'refs/heads/main'");
  expect(y).toContain('github.run_attempt == 1');
  expect(y).toContain('OPENAI_EVAL_API_KEY: ' + '$' + '{{ secrets.OPENAI_EVAL_API_KEY }}');
  expect(y).not.toContain('OPENAI_API_KEY2');
  expect(y).not.toContain('OPENAI_ADMIN_KEY');
  expect(y).not.toContain('  push:');
  expect(s).toContain('P.maxFirstBatchCalls===6');
  expect(s).toContain("await open(log,'wx',0o600)");
  expect(s).toContain('await handle.sync()');
  expect(s).toContain('maxOutputTokens:P.maxOutputTokens');
  expect(s).toContain('process.env.OPENAI_EVAL_API_KEY');
  expect(s).not.toContain('process.env.OPENAI_API_KEY2');
 });
});
