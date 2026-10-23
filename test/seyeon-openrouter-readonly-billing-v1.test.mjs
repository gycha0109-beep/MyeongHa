import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {auditOpenRouterBillingV1,assertOneTimeBillingAuditV1} from '../scripts/seyeon-openrouter-readonly-billing-v1.mjs';

const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',GITHUB_EVENT_NAME:'push',
 GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',
 GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123456'};
const history={total_count:1,workflow_runs:[{id:123456,head_sha:env.GITHUB_SHA,
 event:'push',head_branch:'main',run_attempt:1}]};
const apiKey='sk-or-v1-synthetic-unused-secret-0000000000';
describe('OpenRouter real billing read-only scope',()=>{
 it('admit exactly one immutable main run',()=>{
  expect(assertOneTimeBillingAuditV1(env,history)).toEqual({runId:'123456',sha:env.GITHUB_SHA});
  expect(()=>assertOneTimeBillingAuditV1({...env,GITHUB_RUN_ATTEMPT:'2'},history)).toThrow();
  expect(()=>assertOneTimeBillingAuditV1(env,{...history,total_count:2})).toThrow();
 });
 it('reads key aggregate without interpreting it as historical per-run cost',async()=>{
  const fetchImpl=vi.fn(async url=>{
   if(String(url).endsWith('/key'))return Response.json({data:{
    usage:0.0002,usage_daily:0.00011,usage_weekly:0.0002,usage_monthly:0.0002,
    is_management_key:false,label:'PRIVATE_LABEL_MUST_NOT_LOG'}});
   return Response.json({error:{message:'PRIVATE_PROVIDER_ERROR'}},{status:403});
  });
  const report=await auditOpenRouterBillingV1(apiKey,fetchImpl);
  expect(report.apiKeyAggregateUsageMicroUsd).toBe(200);
  expect(report.creditsStatus).toBe(403);
  expect(report.actualPerGenerationBillVerified).toBe(false);
  expect(report.inferenceRequestsSent).toBe(0);
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_LABEL|PRIVATE_PROVIDER_ERROR/);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  for(const [url,options] of fetchImpl.mock.calls) {
   expect(String(url)).toMatch(/^https:\/\/openrouter\.ai\/api\/v1\/(key|credits)$/);
   expect(options.method).toBe('GET');
  }
 });
 it('rejects missing or invalid usage without inventing a 0-dollar invoice',async()=>{
  const fetchImpl=vi.fn(async()=>Response.json({data:{usage:null}}));
  await expect(auditOpenRouterBillingV1(apiKey,fetchImpl))
   .rejects.toThrow('OPENROUTER_KEY_USAGE_UNAVAILABLE');
 });
 it('hard pins no inference endpoint and only numeric projection in the workflow',()=>{
  const yaml=readFileSync(new URL('../.github/workflows/seyeon-openrouter-billing-readonly-v1.yml',import.meta.url),'utf8');
  expect(yaml).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(yaml).not.toContain('workflow_dispatch:');
  expect(yaml).toContain('environment: production');
  expect(yaml).toContain('persist-credentials: false');
 });
});
