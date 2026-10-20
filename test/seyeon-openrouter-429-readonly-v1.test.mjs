import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {assert429AdmissionV1,diagnose429V1} from '../scripts/seyeon-openrouter-429-readonly-v1.mjs';
const sha='a'.repeat(40),runId='39399990001';
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,GITHUB_RUN_ID:runId};
const history={total_count:1,workflow_runs:[{id:Number(runId),head_sha:sha,head_branch:'main',event:'push',run_attempt:1}]};
const prior={id:39384719879,conclusion:'failure',head_sha:'afd500c5f8638517ea24b430be736057c7a0aa6e',run_attempt:1};
it('rejects duplicate one-shot and replay',()=>{
 expect(assert429AdmissionV1(env,history,prior)).toEqual({runId,sha});
 expect(()=>assert429AdmissionV1({...env,GITHUB_RUN_ATTEMPT:'2'},history,prior)).toThrow();
 expect(()=>assert429AdmissionV1(env,{...history,total_count:2},prior)).toThrow();
});
it('limits reads to four GETs and never emits untrusted content',async()=>{
 const fetchImpl=vi.fn(async(url,init)=>{
  expect(init.method).toBe('GET');
  expect(String(url)).toMatch(/^https:\/\/openrouter\.ai\/api\/v1\/(key|credits|models\/openai\/gpt-oss-(20b|120b)\/endpoints)$/);
  if(String(url).endsWith('/key'))return Response.json({data:{is_free_tier:true,usage:0.000469,limit_remaining:0.2,label:'PRIVATE'}});
  if(String(url).endsWith('/credits'))return Response.json({data:{total_credits:0,total_usage:0.196407,secret:'PRIVATE'}});
  return Response.json({data:{id:String(url).includes('120b')?'openai/gpt-oss-120b':'openai/gpt-oss-20b',endpoints:[{provider_name:'PRIVATE',supported_parameters:['response_format']}]}});
 });
 const report=await diagnose429V1('sk-or-test-long-fake-credential-0000',fetchImpl);
 expect(fetchImpl).toHaveBeenCalledTimes(4);
 expect(report).toMatchObject({isFreeTier:true,purchasedCreditsMicroUsd:0,keyRemainingMicroUsd:200000,gptOss120b:{endpoints:1},historical429RootCauseProven:false,inferenceRequests:0});
 expect(JSON.stringify(report)).not.toContain('PRIVATE');
});
it('invalid GET data means unknown, never implies zero or root cause',async()=>{
 const report=await diagnose429V1('sk-or-test-long-fake-credential-0000',vi.fn(async()=>Response.json({error:'PRIVATE'},{status:403})));
 expect(report.keyRemainingMicroUsd).toBeNull();
 expect(report.historical429RootCauseProven).toBe(false);
});
it('requires production secret, no manual or replay trigger',()=>{
 const wf=readFileSync(new URL('../.github/workflows/seyeon-openrouter-429-readonly-diagnosis-v1.yml',import.meta.url),'utf8');
 expect(wf).toContain('environment: production');
 expect(wf).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
 expect(wf).not.toContain('workflow_dispatch:');
});
