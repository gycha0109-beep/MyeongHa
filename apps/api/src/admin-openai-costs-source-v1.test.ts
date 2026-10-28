import {describe,expect,it,vi} from 'vitest';
import {adminAiBudgetWindowV1} from './admin-ai-budget-v1.js';
import {createOpenAiAdminCostsReaderV1,OPENAI_ORGANIZATION_COSTS_ENDPOINT_V1} from './admin-openai-costs-source-v1.js';

const window=adminAiBudgetWindowV1('2026-10',new Date('2026-11-01T00:00:00Z'));
const adminKey='sk-admin-synthetic-fixture-not-real';
const projectId='proj_myeongha_fixture';
const result=(start:number,amount:number)=>({
  object:'bucket',start_time:start,end_time:start+86400,
  results:[{object:'organization.costs.result',project_id:projectId,
    amount:{currency:'usd',value:amount}}],
});
const reply=(data:unknown[],has_more=false,next_page:string|null=null)=>
  Response.json({object:'page',data,has_more,next_page});
describe('OpenAI Admin costs official read-only source',()=>{
  it('queries only the fixed project and exact date range with an injected Admin key, exhausts pagination',async()=>{
    const a=Math.floor(Date.parse(window.from)/1000),urls:string[]=[],requests:RequestInit[]=[];
    const api=vi.fn(async(url:string,init:RequestInit)=>{
      urls.push(url);requests.push(init);
      return urls.length===1?reply([result(a,0.01)],true,'next-page') : reply([result(a+86400,0.12)]);
    });
    const reader=createOpenAiAdminCostsReaderV1({adminKey,projectId,fetchImpl:api as typeof fetch});
    expect(urls).toHaveLength(0);
    const observed=await reader.read(window);
    expect(observed).toMatchObject({observedMicroUsd:'130000',pageCount:2,
      billingStatus:'provider_reported_not_final_invoice',invoiceConfirmed:false,
      scope:'project_all_line_items',provider:'openai'});
    expect(observed?.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(urls.every(url=>url.startsWith(OPENAI_ORGANIZATION_COSTS_ENDPOINT_V1+'?'))).toBe(true);
    expect(new URL(urls[0]!).searchParams.get('project_ids[]')).toBe(projectId);
    expect(new URL(urls[0]!).searchParams.get('start_time')).toBe(String(a));
    expect(new URL(urls[1]!).searchParams.get('page')).toBe('next-page');
    expect(requests.map(x=>x.method)).toEqual(['GET','GET']);
    expect(requests[0]?.headers).toMatchObject({Authorization:'Bearer '+adminKey});
    expect(JSON.stringify(observed)).not.toContain(adminKey);
  });
  it('reports only the elapsed part of the current Seoul month, not future costs',async()=>{
    const current=adminAiBudgetWindowV1('2026-10',new Date('2026-10-28T06:00:00Z'));
    const seen:string[]=[];
    const reader=createOpenAiAdminCostsReaderV1({adminKey,projectId,
      fetchImpl:(async url=>{seen.push(String(url));return reply([]);}) as typeof fetch});
    const observed=await reader.read(current);
    expect(new URL(seen[0]!).searchParams.get('end_time')).toBe(String(Math.floor(Date.parse(current.observedThrough)/1000)));
    expect(observed?.invoiceConfirmed).toBe(false);
  });
  it('rejects source authentication, unsupported currencies and cross-project totals',async()=>{
    expect(()=>createOpenAiAdminCostsReaderV1({adminKey:'short',projectId})).toThrow();
    expect(()=>createOpenAiAdminCostsReaderV1({adminKey,projectId:'wrong'})).toThrow();
    const a=Math.floor(Date.parse(window.from)/1000);
    for(const response of [
      Response.json({error:'unauthorized'},{status:401}),
      reply([{...result(a,0.1),results:[{object:'organization.costs.result',project_id:'proj_other',amount:{currency:'usd',value:0.1}}]}]),
      reply([{...result(a,0.1),results:[{object:'organization.costs.result',project_id:projectId,amount:{currency:'krw',value:0.1}}]}]),
      reply([result(a,-1)]),
    ]){
      const reader=createOpenAiAdminCostsReaderV1({adminKey,projectId,fetchImpl:async()=>response});
      await expect(reader.read(window)).rejects.toThrow();
    }
  });
  it('rejects truncated, repeated or malformed pagination instead of treating a partial sum as complete',async()=>{
    const a=Math.floor(Date.parse(window.from)/1000);
    const api=vi.fn(async()=>reply([result(a,1)],true,'same-cursor'));
    await expect(createOpenAiAdminCostsReaderV1({adminKey,projectId,fetchImpl:api}).read(window))
      .rejects.toThrow(/pagination cursor/u);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
