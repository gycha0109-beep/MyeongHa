import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  C08_N06_CANARY_MARKER as MARKER,
  C08_N06_CANARY_MODEL as MODEL,
  C08_N06_CANARY_TEXT as N06,
  admitSeyeonC08N06PaidCanaryOnceV1 as admit,
  chooseSeyeonC08N06CanaryZdrRouteV1 as choose,
  buildSeyeonC08N06CanaryBodyV1 as build,
  reserveSeyeonC08N06CanaryV1 as reserve,
  runSeyeonC08N06ActualCanaryV1 as run,
} from '../scripts/seyeon-c08-n06-actual-paid-canary-once-v1.mjs';

const sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'gycha0109-beep/MyeongHa',
  GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main',
  GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,
  EXPECTED_HEAD_SHA:sha,GITHUB_RUN_ID:'123456789'};
const history={total_count:1,workflow_runs:[{
  id:123456789,head_sha:sha,head_branch:'main',
  event:'push',run_attempt:1,
}]};
const commit={sha,files:[{filename:MARKER,status:'added'}]};
const routeRow=()=>({model_id:MODEL,tag:'openai',status:0,
  max_completion_tokens:4096,supported_parameters:['response_format'],
  pricing:{prompt:'0.00000003',completion:'0.00000017',request:'0'}});
const key={is_management_key:false,limit_remaining:1};
const credits={total_credits:10,total_usage:1};
const successResponse=()=>Response.json({
  model:MODEL,choices:[{finish_reason:'stop',
    message:{content:JSON.stringify({utterance:'오늘은 내가 먼저 이야기할게요.'})}}],
  usage:{prompt_tokens:700,completion_tokens:88},
});
function fakeResponses({zdr=[routeRow()],post=successResponse()}={}){
  const urls=[];
  const fetchImpl=async(url,init)=>{
    urls.push({url,init});
    if(url.endsWith('/key'))return Response.json({data:key});
    if(url.endsWith('/credits'))return Response.json({data:credits});
    if(url.endsWith('/endpoints/zdr'))return Response.json({data:zdr});
    if(url.endsWith('/chat/completions'))return post;
    throw Error('extra call not allowed');
  };
  return {urls,fetchImpl};
}

describe('C08 N06 first ACTUAL PAID canary admission, mocked API in CI',()=>{
  it('accepts only protected-main first-added-marker single run',()=>{
    expect(admit(env,history,commit)).toEqual({sha,runId:'123456789'});
    for(const c of [
      null,{}, {...commit,sha:'b'.repeat(40)},
      {...commit,files:[{filename:MARKER,status:'modified'}]},
      {...commit,files:[...commit.files,...commit.files]},
    ])expect(()=>admit(env,history,c)).toThrow('C08_N06_PAID_CANARY_ADMISSION_HOLD');
    expect(()=>admit({...env,GITHUB_RUN_ATTEMPT:'2'},history,commit)).toThrow();
    expect(()=>admit(env,{...history,total_count:2},commit)).toThrow();
  });

  it('requires cheap active ZDR support and account credit before 1 POST',()=>{
    expect(choose([routeRow()],key,credits)).toMatchObject({
      tag:'openai',inputRate:0.03,outputRate:0.17,
      strictJsonRuntimeVerified:false,hardBillingCapVerified:false,
    });
    for(const mutation of [
      row=>{row.status=1;},
      row=>{row.model_id='other/model';},
      row=>{row.supported_parameters=['max_tokens'];},
      row=>{row.max_completion_tokens=1;},
      row=>{row.pricing.request='0.01';},
      row=>{row.pricing.prompt='0.0000002';},
      row=>{row.pricing.completion='0.0000009';},
      row=>{row.tag='not valid tag';},
    ]){
      const row=routeRow();mutation(row);
      expect(choose([row],key,credits)).toBe(null);
    }
    expect(choose([routeRow(),routeRow()],key,credits)).toBe(null);
    expect(choose([routeRow()],{...key,is_management_key:true},credits)).toBe(null);
    expect(choose([routeRow()],key,{...credits,total_usage:10})).toBe(null);
  });

  it('captures 1 exact private-free request and cost before dispatch',()=>{
    const body=build('openai');
    const b=JSON.parse(body);
    expect(b.model).toBe(MODEL);
    expect(b.messages[1].content).toBe(N06);
    expect(b.provider).toMatchObject({
      only:['openai'],zdr:true,data_collection:'deny',
      allow_fallbacks:false,require_parameters:true,
    });
    expect(b.response_format.json_schema.strict).toBe(true);
    expect(b.max_completion_tokens).toBe(256);
    const reserveQuote=reserve(body,{inputRate:0.03,outputRate:0.17});
    expect(reserveQuote.reservedMicroUsd).toBeGreaterThan(0);
    expect(reserveQuote.reservedMicroUsd).toBeLessThan(4000);
    expect(reserveQuote.maxPaidCalls).toBe(1);
    expect(reserveQuote.invoicedChargeHardCapped).toBe(false);
  });

  it('makes exactly one POST after fsynced reservation, and records numeric-only evidence',async()=>{
    const {urls,fetchImpl}=fakeResponses();
    const journal=[];
    const r=await run({apiKey:'test-only-'+'x'.repeat(30),fetchImpl,
      journal:async value=>{journal.push(value);}});
    expect(urls.map(x=>x.init.method)).toEqual(['GET','GET','GET','POST']);
    expect(journal[0].kind).toBe('reserved_before_post');
    expect(journal[1].kind).toBe('observed_paid_call');
    expect(r).toMatchObject({
      attemptedPaidCalls:1,verdict:'OBSERVED_VALID_JSON',
      jsonShapeObserved:true,strictJsonRuntimeObservedForOneCall:true,
      requestZdrClaimed:true,hardBillingCapVerified:false,
      invoiceReconciled:false,productionPromotionAuthorized:false,
    });
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(r.completionTokens).toBe(88);
    expect(JSON.stringify(r)).not.toContain('오늘은 내가 먼저');
    expect(JSON.stringify(journal)).not.toContain('test-only-');
    expect(urls[3].init.body).toContain(N06);
  });

  it('no eligible provider never calls a model or writes any journal',async()=>{
    const {urls,fetchImpl}=fakeResponses({zdr:[]});
    let journal=0;
    const r=await run({apiKey:'test-only-'+'x'.repeat(30),fetchImpl,
      journal:async()=>{journal++;}});
    expect(r).toMatchObject({verdict:'HOLD',attemptedPaidCalls:0});
    expect(urls).toHaveLength(3);
    expect(journal).toBe(0);
  });

  it('single HTTP failure or JSON invalid cannot trigger retry',async()=>{
    for(const response of [
      new Response('down',{status:429}),
      Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}],
        usage:{prompt_tokens:700,completion_tokens:256}}),
      Response.json({choices:[{finish_reason:'stop',
        message:{content:'{invalid'}}],
        usage:{prompt_tokens:700,completion_tokens:10}}),
    ]){
      const {urls,fetchImpl}=fakeResponses({post:response});
      const j=[];
      const r=await run({apiKey:'test-only-'+'x'.repeat(30),
        fetchImpl,journal:async x=>{j.push(x);}});
      expect(r.verdict).toBe('HOLD');
      expect(r.attemptedPaidCalls).toBe(1);
      expect(urls.filter(x=>x.init.method==='POST')).toHaveLength(1);
    }
  });

  it('main workflow is single-marker-only, contains no pull request trigger',()=>{
    const source=readFileSync(new URL('../.github/workflows/seyeon-c08-n06-paid-canary-once-v1.yml',import.meta.url),'utf8');
    expect(source).toContain('push:');
    expect(source).toContain(MARKER);
    expect(source).not.toContain('pull_request:');
    expect(source).not.toContain('workflow_dispatch:');
    expect(source).toContain('contents: read');
    expect(source).not.toContain('contents: write');
    expect(source).not.toContain('npx wrangler deploy');
  });
});
