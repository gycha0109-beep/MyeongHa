import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertOpenRouterThreeCallAdmissionV1 as admit}
 from '../scripts/seyeon-openrouter-three-call-admission-v1.mjs';
const id='39390000011',sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:id,GITHUB_SHA:sha};
const history={total_count:1,workflow_runs:[{
 id:Number(id),head_sha:sha,run_attempt:1,
 event:'push',head_branch:'main'}]};
const previous={id:39366717049,
 head_sha:'1feaa6a8c8300024b32fa2787614896051397280',
 status:'completed',conclusion:'success',run_attempt:1};
const pr={number:2369,merged:true,
 merge_commit_sha:'1feaa6a8c8300024b32fa2787614896051397280'};
describe('GPT-OSS 20B one-shot public three-call Shadow',()=>{
 it('admits the correct immutable first main push only after real HTTP 200',()=>{
  expect(admit(env,history,previous,pr)).toEqual({runId:id,sha});
  expect(()=>admit({...env,GITHUB_RUN_ATTEMPT:'2'},history,previous,pr)).toThrow();
  expect(()=>admit({...env,GITHUB_EVENT_NAME:'workflow_dispatch'},history,previous,pr)).toThrow();
  expect(()=>admit(env,{...history,total_count:2},previous,pr)).toThrow();
  expect(()=>admit(env,{...history,workflow_runs:[{
   ...history.workflow_runs[0],head_sha:'b'.repeat(40)}]},previous,pr)).toThrow();
  expect(()=>admit(env,history,{...previous,conclusion:'failure'},pr)).toThrow();
  expect(()=>admit(env,history,previous,{...pr,merged:false})).toThrow();
 });
 it('limits provider to three enumerated stages and previous 5000 KRW budget',()=>{
  const src=readFileSync(new URL('../scripts/run-seyeon-openrouter-first-three-call-v1.mjs',import.meta.url),'utf8');
  const wf=readFileSync(new URL('../.github/workflows/seyeon-openrouter-three-call-first-turn-v1.yml',import.meta.url),'utf8');
  expect(src).toContain("const MODEL='openai/gpt-oss-20b',MAX_CALLS=3,MAX_OUTPUT_TOKENS=1536;");
  expect(src).toContain('const RESERVE_PER_CALL_USD=0.02,MAX_RESERVED_USD=0.06;');
  expect(src).toContain('const PRIOR_RESERVED_MICRO_USD=816554');
  expect(src).toContain('OWNER_ADDITIONAL_CAP_KRW=5000');
  expect(src).toContain('await ledger.sync()');
  expect(src).toContain('data.purpose!==stages[attempts]');
  expect(src).toContain('runSeyeonCensusFirstThreeCallShadowV1');
  expect(src).toContain('census.readCount!==4');
  expect(src).toContain("spec.text!=='안녕, 세연아!'");
  expect(src).toContain('actualBilledMicroUsd:null,invoiceReconciled:false');
  expect(src).toContain('characterVoiceQualityVerified:false,productionPromotionPermitted:false');
  expect(wf).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(wf).toContain('ref: $'+'{{ github.sha }}');
  expect(wf).toContain('environment: production');
  expect(wf).not.toContain('workflow_dispatch:');
  expect(wf).not.toContain('OPENAI_API_KEY:');
 });
});
