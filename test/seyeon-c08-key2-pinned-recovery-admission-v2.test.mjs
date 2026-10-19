import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertSeyeonC08Key2PinnedRecoveryV2 as admit} from
 '../scripts/seyeon-c08-key2-pinned-recovery-admission-v2.mjs';
import {SEYEON_C08T_FIRST_PAID_PILOT_POLICY_V1 as P} from
 '../scripts/seyeon-cost-c08t-owner-budget-pilot-v1.mjs';
const id='39220000001',sha='a'.repeat(40);
const ctx={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ID:id,GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{
 id:Number(id),event:'push',head_branch:'main',head_sha:sha,
 run_attempt:1}]};
const previous={id:39217368031,head_sha:'27c3ed3b28baba2052ecae8aa6a4fc487589f2ee',
 status:'completed',conclusion:'failure',event:'push',
 head_branch:'main',run_attempt:1};
describe('KEY2 pinned-commit one-time recovery (never contacts provider)',()=>{
 it('accepts immutable triggering SHA without consulting moving main',()=>{
  expect(admit(ctx,history,previous)).toEqual({
   scope:'ONE_BOUNDED_REAL_BATCH',runId:id,mainSha:sha});
  // The default branch can advance any number of commits mid-run.
  expect(admit(ctx,history,previous).mainSha).toBe(sha);
 });
 it('rejects invalid event, rerun, competing recovery, or altered historical run',()=>{
  for(const e of [
   {...ctx,GITHUB_RUN_ATTEMPT:'2'}, {...ctx,GITHUB_REF:'refs/heads/dev'},
   {...ctx,GITHUB_EVENT_NAME:'workflow_dispatch'},
   {...ctx,GITHUB_REPOSITORY:'other/repo'},
  ])expect(()=>admit(e,history,previous)).toThrow();
  for(const h of [
   {...history,total_count:2},
   {...history,workflow_runs:[]},
   {...history,workflow_runs:[{...history.workflow_runs[0],
    head_sha:'b'.repeat(40)}]},
   {...history,workflow_runs:[{...history.workflow_runs[0],
    id:Number(id)+1}]},
  ])expect(()=>admit(ctx,h,previous)).toThrow();
  for(const old of [
   {...previous,id:39217368031+1},
   {...previous,head_sha:'b'.repeat(40)},
   {...previous,conclusion:'success'},
   {...previous,run_attempt:2},
  ])expect(()=>admit(ctx,history,old)).toThrow();
 });
 it('keeps original six slots, KEY2, budget and immutable checkout',()=>{
  const y=readFileSync(new URL(
   '../.github/workflows/seyeon-c08-key2-pinned-recovery-real-v2.yml',import.meta.url),'utf8');
  const script=readFileSync(new URL(
   '../scripts/seyeon-c08-key2-pinned-recovery-admission-v2.mjs',import.meta.url),'utf8');
  const core=readFileSync(new URL(
   '../scripts/run-seyeon-c08-key2-first-six-real-v1.mjs',
   import.meta.url),'utf8');
  expect(y).toContain("      - '.github/seyeon-c08-key2-pinned-recovery-real.trigger'");
  expect(y).toContain('ref: $'+'{{ github.sha }}');
  expect(y).toContain("github.run_attempt == 1");
  expect(y).toContain('OPENAI_API_KEY2: ' + '$' +
   '{{ secrets.OPENAI_API_KEY2 }}');
  expect(y).not.toContain('workflow_dispatch:');
  expect(script).not.toContain('/git/ref/heads/main');
  expect(script).toContain('/runs?event=push&per_page=100');
  expect(core).toContain('runSeyeonC08Key2RealSixV1(admitRun=admit)');
  expect(core).toContain('await handle.sync()');
  expect(P.caseIds).toEqual(['A01','H01','C02_mixed-admin-private_01']);
  expect(P.maxFirstBatchCalls).toBe(6);
  expect(P.firstBatchReservedMicroUsd).toBe(19662);
  expect(P.additionalBudgetKrw).toBe(5000);
 });
});
