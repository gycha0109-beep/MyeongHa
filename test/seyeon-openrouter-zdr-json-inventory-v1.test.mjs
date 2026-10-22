import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {assertInventoryAdmissionV1,findMatchedZdrJsonEndpointsV1,
 inspectOpenRouterZdrJsonV1,SHORTLIST} from '../scripts/seyeon-openrouter-zdr-json-inventory-v1.mjs';
const id='nvidia/nemotron-3.5-lightning',env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
 GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',
 GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'39399991111'};
const history={total_count:1,workflow_runs:[{id:39399991111,event:'push',
 head_branch:'main',head_sha:env.GITHUB_SHA,run_attempt:1}]};
describe('Read-only ZDR and JSON schema provider intersection',()=>{
 it('admits only one pinned first main run',()=>{
  expect(assertInventoryAdmissionV1(env,history)).toEqual({sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID});
  expect(()=>assertInventoryAdmissionV1({...env,GITHUB_RUN_ATTEMPT:'2'},history)).toThrow();
  expect(()=>assertInventoryAdmissionV1(env,{...history,total_count:2})).toThrow();
 });
 it('requires same model ID and same provider tag in both official sources',()=>{
  const Z=[{model_id:id,tag:'provider/one',supported_parameters:['response_format'],pricing:{}},
   {model_id:id,tag:'provider/two',supported_parameters:['response_format']}];
  const E=[{id,endpoints:[
   {tag:'provider/one',supported_parameters:['response_format'],pricing:{prompt:'0.00000005',completion:'0.0000002'}},
   {tag:'provider/two',supported_parameters:['tools'],pricing:{prompt:'0',completion:'0'}},
  ]}];
  const matched=findMatchedZdrJsonEndpointsV1(Z,E);
  expect(matched).toHaveLength(1);
  expect(matched[0]).toMatchObject({modelId:id,providerTag:'provider/one',
    inputCostPerMillionUsd:0.05,outputCostPerMillionUsd:0.2,
    strictJsonSchemaUnverified:true,requestLevelDenyUnverified:true,accountRouteUnverified:true});
  expect(findMatchedZdrJsonEndpointsV1(Z,[{id,endpoints:[{tag:'other',supported_parameters:['response_format']}]}])).toEqual([]);
 });
 it('uses only metadata GETs, never emits private payload, never assumes paid access',async()=>{
  const fetchImpl=vi.fn(async(url,opts)=>{
   expect(opts.method).toBe('GET');
   if(String(url).endsWith('/endpoints/zdr'))return Response.json({data:[
     {model_id:id,tag:'provider/one',supported_parameters:['response_format']},
     {model_id:'some/model:free',tag:'free-provider',supported_parameters:['response_format']},
   ]});
   if(String(url).endsWith('/key'))return Response.json({data:{is_free_tier:true,usage:0.000469,secret:'PRIVATE_KEY'}});
   if(String(url).endsWith('/credits'))return Response.json({data:{total_credits:0,total_usage:0.1964,secret:'PRIVATE_BILL'}});
   const model=SHORTLIST.find(x=>String(url).endsWith(x+'/endpoints'));
   return Response.json({data:{id:model,endpoints:[{tag:'provider/one',
     supported_parameters:['response_format'],pricing:{prompt:'0.00000005',completion:'0.0000002'}}],
     secret:'PRIVATE_PROVIDER'}});
  });
  const result=await inspectOpenRouterZdrJsonV1('sk-or-test-long-enough-fake-0000000',fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(3+SHORTLIST.length);
  expect(result).toMatchObject({inferenceRequestCount:0,purchasedCreditsMicroUsd:0,
   intersectionCount:1,freeZdrResponseFormatCandidates:['some/model:free']});
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
 });
 it('no documented provider fallback or lower-privacy request is authorized by this inventory',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/seyeon-openrouter-zdr-json-catalog-v1.yml',import.meta.url),'utf8');
  expect(workflow).toContain('OPENROUTER_API_KEY: $'+'{{ secrets.OPENROUTER_API_KEY }}');
  expect(workflow).not.toContain('workflow_dispatch:');
  expect(workflow).toContain('environment: production');
 });
});
