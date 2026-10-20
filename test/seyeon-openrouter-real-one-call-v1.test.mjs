import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertOpenRouterOneCallAdmissionV1 as admit} from
 '../scripts/seyeon-openrouter-real-one-call-admission-v1.mjs';
const id='39390000111',sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',
 GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:id,GITHUB_SHA:sha};
const h={total_count:1,workflow_runs:[{id:Number(id),head_sha:sha,
  run_attempt:1,event:'push',head_branch:'main'}]};
const pr={number:2366,merged:true,merge_commit_sha:
 '30aeef27bc59a8044db203abdba3ef0a3df84c31'};
describe('one owner-approved OpenRouter N01 synthetic request',()=>{
 it('only admits an immutable first push and reviewed merged adapter',()=>{
  expect(admit(env,h,pr)).toEqual({runId:id,sha});
  expect(()=>admit({...env,GITHUB_RUN_ATTEMPT:'2'},h,pr)).toThrow();
  expect(()=>admit({...env,GITHUB_REF:'refs/heads/test'},h,pr)).toThrow();
  expect(()=>admit(env,{...h,total_count:2},pr)).toThrow();
  expect(()=>admit(env,{...h,workflow_runs:[{...h.workflow_runs[0],
   head_sha:'b'.repeat(40)}]},pr)).toThrow();
  expect(()=>admit(env,h,{...pr,merged:false})).toThrow();
 });
 it('limits a single paid attempt and leaves all Production wiring untouched',()=>{
  const source=readFileSync(new URL('../scripts/run-seyeon-openrouter-real-one-call-v1.mjs',import.meta.url),'utf8');
  const yaml=readFileSync(new URL('../.github/workflows/seyeon-openrouter-real-one-call-v1.yml',import.meta.url),'utf8');
  expect(source).toContain('MAX_CALLS=1,MAX_COMPLETION_TOKENS=1024');
  expect(source).toContain('const MAX_RESERVE_USD=0.01');
  expect(source).toContain("userText:'안녕, 세연아!'");
  expect(source).toContain('createSeyeonUnifiedPreflightShadowV1(provider).classify');
  expect(source).toContain('await ledger.sync()');
  expect(source).toContain('actualBilledMicroUsd:null');
  expect(source).toContain('productionPromotionPermitted:false');
  expect(yaml).toContain('environment: production');
  expect(yaml).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(yaml).toContain('ref: $'+'{{ github.sha }}');
  expect(yaml).not.toContain('workflow_dispatch:');
 });
});
