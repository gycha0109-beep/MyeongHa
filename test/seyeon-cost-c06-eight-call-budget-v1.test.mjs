import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {SEYEON_C06_EIGHT_CALL_POLICY_V1 as P,
  SEYEON_C06_EIGHT_CALL_PER_DISPATCH_RESERVE_MICRO_USD_V1 as PER,
  SEYEON_C06_EIGHT_CALL_MAX_RESERVED_MICRO_USD_V1 as MAX,
  createSeyeonC06EightCallQuotaV1 as createQuota}
from '../scripts/seyeon-cost-c06-eight-call-budget-v1.mjs';
const uuid=i=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0');
const make=(i=0)=>({
  caseId:P.caseIds[Math.floor(i/2)],variant:P.variants[i%2],
  callId:uuid(i),purpose:P.purpose,modelKey:P.model,
  requestBodyBytes:4500,
});
describe('C06 manual-only, single eight-call budget and consent scope',()=>{
  it('defines a pinned 8-call Luna screen with <$0.03 prospective reserve',()=>{
    expect(P).toMatchObject({
      model:'gpt-5.6-luna',callCap:8,
      maxRequestBodyBytes:6144,conservativeInputTokenUpper:8192,
      providerOutputTokenCap:1024,approvedProposedBudgetMicroUsd:30000,
    });
    expect(P.caseIds).toHaveLength(4);
    expect(P.variants).toEqual(['original','compact']);
    expect(PER).toBe(3277);
    expect(MAX).toBe(26216);
    expect(MAX).toBeLessThanOrEqual(P.approvedProposedBudgetMicroUsd);
  });
  it('reserves every exact case+variant only once; no ninth call or retries',()=>{
    const q=createQuota();
    for(let i=0;i<8;i++){
      const rec=q.reserve(make(i));
      expect(rec.reservedMicroUsd).toBe(PER);
      const obs=q.observe({
        callId:rec.callId,purpose:P.purpose,modelKey:P.model,
        outcome:'response_received',inputTokens:3000,outputTokens:200,
        elapsedMs:400+i,
      });
      expect(obs.observation).toBe('USAGE_BOUNDED_ESTIMATE');
      expect(obs.estimatedCostMicroUsd).toBe(990);
    }
    expect(q.snapshot()).toMatchObject({
      attemptedCalls:8,observedOutcomes:8,reservedMicroUsd:26216,
      totalCostEstimateMicroUsd:7920,
      providerInvoiceReconciled:false,productionPromotionPermitted:false,
    });
    expect(()=>q.reserve(make(8))).toThrow(/cap exhausted/u);
  });
  it('rejects forged model/purpose, out-of-sequence variant, duplicate and overlong requests',()=>{
    const changes=[
      x=>x.modelKey='gpt-5.6-terra',
      x=>x.purpose='turn_interpretation',
      x=>x.caseId='not-fixture',
      x=>x.variant='compact',
      x=>x.requestBodyBytes=6145,
      x=>x.requestBodyBytes=0,
    ];
    for(const edit of changes){
      const q=createQuota(),x=make();edit(x);
      expect(()=>q.reserve(x)).toThrow(/admission rejected/u);
      expect(q.snapshot().attemptedCalls).toBe(0);
    }
    const q=createQuota();q.reserve(make());
    expect(()=>q.reserve(make())).toThrow();
  });
  it('treats timeout, unknown usage, over-limit tokens and double callbacks as HOLD',()=>{
    const observations=[
      {outcome:'timeout',inputTokens:null,outputTokens:null},
      {outcome:'response_received',inputTokens:null,outputTokens:100},
      {outcome:'response_received',inputTokens:8193,outputTokens:100},
      {outcome:'response_received',inputTokens:100,outputTokens:1025},
    ];
    for(const fields of observations){
      const q=createQuota(),rec=q.reserve(make());
      const r=q.observe({
        callId:rec.callId,purpose:P.purpose,modelKey:P.model,
        elapsedMs:500,...fields,
      });
      expect(r.observation).toBe('UNKNOWN_OR_OUT_OF_POLICY_HOLD');
      expect(q.snapshot().totalCostEstimateMicroUsd).toBeNull();
      expect(q.snapshot().reservedMicroUsd).toBe(PER);
      expect(()=>q.observe({callId:rec.callId,
        purpose:P.purpose,modelKey:P.model,...fields})).toThrow();
    }
  });
  it('workflow only supports manual main, dedicated KEY2, and permanent legacy 5v3 hold',()=>{
    const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
    const scoped=read('.github/workflows/seyeon-model-eval-v1.yml');
    const legacy=read('.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml');
    const script=read('scripts/run-seyeon-cost-c06-eight-call-v1.mjs');
    expect(scoped).toMatch(/workflow_dispatch:/u);
    expect(scoped).not.toMatch(/^\s+push:/mu);
    expect(scoped).toContain("github.ref == 'refs/heads/main'");
    expect(scoped).toContain('secrets.OPENAI_API_KEY2');
    expect(scoped).not.toContain('secrets.OPENAI_API_KEY }}');
    expect(scoped).toContain('run-seyeon-cost-c06-eight-call-v1.mjs');
    expect(legacy.split(/^  compare:\s*$/m)[1].split(/^    steps:\s*$/m)[0])
      .toContain('if: $'+'{{ false }}');
    expect(script).toContain('process.env.OPENAI_API_KEY2?.trim()');
    expect(script).not.toContain('process.env.OPENAI_API_KEY?.');
    expect(script).toContain('maxOutputTokens:P.providerOutputTokenCap');
  });
});
