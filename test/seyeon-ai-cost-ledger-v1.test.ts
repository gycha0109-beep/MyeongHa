import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistingSeyeonAiProviderV1,
  insertSeyeonAiCallCostV1,
  startSeyeonAiCallV1,
  settleSeyeonAiCallV1,
  readSeyeonAiTurnCostV1,
  type SeyeonAiCostLedgerBindingV1,
} from '../apps/api/src/postgres-seyeon-ai-cost-ledger-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import type {
  SeyeonProductionSubjectTransactionRunnerV1,
} from '../apps/api/src/seyeon-production-subject-transaction-v1.js';
import {
  createSeyeonAiCostEventV1,
} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const turnId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const callId = '44444444-4444-4444-8444-444444444444';
const binding: SeyeonAiCostLedgerBindingV1 = {
  subjectId,turnId,attemptId,phase:'chat',
};
const event = createSeyeonAiCostEventV1({
  callId,purpose:'dialogue_render',providerKey:'openai-responses',
  modelKey:'test-model',outcome:'response_received',httpStatus:200,
  elapsedMs:20,
  usage:{inputTokens:100,outputTokens:50,cachedInputTokens:0,reasoningTokens:0},
});
const key = 'sk-mock-' + '0'.repeat(30);
const request = {
  contractVersion:'seyeon-structured-provider-v2' as const,
  purpose:'dialogue_render' as const,
  instructions:'no paid evaluation',
  input:{text:'offline fixture'},
  responseSchema:{type:'object'},
};
function response() {
  return new Response(JSON.stringify({
    status:'completed',
    usage:{
      input_tokens:10,output_tokens:5,
      input_tokens_details:{cached_tokens:0},
      output_tokens_details:{reasoning_tokens:0},
    },
    output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}],
  }),{status:200,headers:{'content-type':'application/json'}});
}
afterEach(()=>vi.restoreAllMocks());

describe('Se-yeon durable AI cost ledger (offline)',()=>{
  it('inserts the exact structured event with canonical Subject binding',async()=>{
    const query = vi.fn().mockResolvedValue({rows:[{callId,replayed:false}]});
    const client = {query} as unknown as PostgresTransactionQueryV1;
    expect(await insertSeyeonAiCallCostV1(client,binding,event)).toEqual({
      callId,replayed:false,
    });
    const [statement,values] = query.mock.calls[0]!;
    expect(statement).toContain('cmd_record_seyeon_ai_call_cost_v1');
    expect(values.slice(0,4)).toEqual([subjectId,turnId,attemptId,'chat']);
    const payload = JSON.parse(values[4]);
    expect(payload).toMatchObject({
      callId,invoiceReconciled:false,costStatus:'price_unknown',
      estimatedCostMicroUsd:null,
    });
    expect(JSON.stringify(values)).not.toContain('offline fixture');
  });

  it('rejects write receipt drift and invalid attribution before returning success',async()=>{
    const client = {query:vi.fn().mockResolvedValue({
      rows:[{callId:'55555555-5555-4555-8555-555555555555',replayed:false}],
    })} as unknown as PostgresTransactionQueryV1;
    await expect(insertSeyeonAiCallCostV1(client,binding,event))
      .rejects.toThrow('matching write receipt');
    await expect(insertSeyeonAiCallCostV1(client,{...binding,attemptId:'bad'},event))
      .rejects.toThrow('UUID');
  });

  it('preserves unknown expense rather than silently returning a zero total',async()=>{
    const client = {query:vi.fn().mockResolvedValue({rows:[{
      callCount:'3',knownCostMicroUsd:'285',unknownCostCalls:'1',
      totalEstimatedCostMicroUsd:null,
    }]})} as unknown as PostgresTransactionQueryV1;
    expect(await readSeyeonAiTurnCostV1(client,subjectId,turnId)).toEqual({
      callCount:3,knownCostMicroUsd:285n,unknownCostCalls:1,
      totalEstimatedCostMicroUsd:null,
    });
  });

  it('writes a strict start receipt before calling the provider', async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{callId}]});
    const client={query} as unknown as PostgresTransactionQueryV1;
    expect(await startSeyeonAiCallV1(client,binding,{
      callId,purpose:'dialogue_render',providerKey:'openai-responses',modelKey:'test-model',
    })).toBe(callId);
    expect(query.mock.calls[0]![0]).toContain('cmd_start_seyeon_ai_call_v1');
    expect(query.mock.calls[0]![1]).toEqual([
      subjectId,turnId,attemptId,'chat',callId,'dialogue_render','openai-responses','test-model',
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain('offline fixture');
  });

  it('checks settlement receipt and cost payload separately from dispatch',async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{callId,replayed:false}]});
    const client={query} as unknown as PostgresTransactionQueryV1;
    expect(await settleSeyeonAiCallV1(client,binding,event))
      .toEqual({callId,replayed:false});
    expect(query.mock.calls[0]![0]).toContain('cmd_settle_seyeon_ai_call_v1');
    expect(JSON.parse(query.mock.calls[0]![1][4])).toMatchObject({
      callId,costStatus:'price_unknown',estimatedCostMicroUsd:null,
    });
  });

  it('commits a start before mocked inference and settles the identical provider call',async()=>{
    const order:string[]=[];
    let startId='';
    const query=vi.fn().mockImplementation(async (sql:string,values:unknown[])=>{
      if(sql.includes('cmd_start_seyeon_ai_call_v1')) {
        order.push('start');
        startId=String(values[4]);
        return {rows:[{callId:startId}]};
      }
      if(sql.includes('cmd_settle_seyeon_ai_call_v1')) {
        order.push('settle');
        expect(JSON.parse(String(values[4])).callId).toBe(startId);
        return {rows:[{callId:startId,replayed:false}]};
      }
      throw new Error('Unexpected cost ledger SQL');
    });
    const client={query} as unknown as PostgresTransactionQueryV1;
    const runner:SeyeonProductionSubjectTransactionRunnerV1={
      resolveSubject:async()=>({subjectId,subjectKind:'member'}),
      run:async (_subject,execute)=>execute(client,{subjectId,subjectKind:'member'}),
    };
    const fetchImpl=vi.fn(async (_url:string,init:RequestInit)=>{
      order.push('fetch');
      expect(new Headers(init.headers).get('x-client-request-id')).toBe(startId);
      return response();
    });
    vi.spyOn(console,'info').mockImplementation(()=>undefined);
    const provider=createPersistingSeyeonAiProviderV1({
      config:{apiKey:key,model:'test-model',fetchImpl},
      runner,getBinding:()=>binding,
    });
    expect(await provider.generate(request)).toEqual({ok:true});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['start','fetch','settle']);
    expect(JSON.stringify(query.mock.calls)).not.toContain('offline fixture');
  });

  it('blocks external inference if the pre-dispatch ledger is unavailable',async()=>{
    const query=vi.fn().mockRejectedValue(new Error('database credential canary'));
    const client={query} as unknown as PostgresTransactionQueryV1;
    const runner:SeyeonProductionSubjectTransactionRunnerV1={
      resolveSubject:async()=>({subjectId,subjectKind:'member'}),
      run:async (_subject,execute)=>execute(client,{subjectId,subjectKind:'member'}),
    };
    const fetchImpl=vi.fn(async()=>response());
    const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    const provider=createPersistingSeyeonAiProviderV1({
      config:{apiKey:key,model:'test-model',fetchImpl},
      runner,getBinding:()=>binding,
    });
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errors.mock.calls)).not.toContain('database credential canary');
  });

  it('does not repeat paid inference when settlement fails after a successful response',async()=>{
    let startedCallId='';
    const query=vi.fn().mockImplementation(async (sql:string,values:unknown[])=>{
      if(sql.includes('cmd_start_seyeon_ai_call_v1')) {
        startedCallId=String(values[4]);
        return {rows:[{callId:startedCallId}]};
      }
      throw new Error('database credential canary');
    });
    const client={query} as unknown as PostgresTransactionQueryV1;
    const runner:SeyeonProductionSubjectTransactionRunnerV1={
      resolveSubject:async()=>({subjectId,subjectKind:'member'}),
      run:async (_subject,execute)=>execute(client,{subjectId,subjectKind:'member'}),
    };
    const fetchImpl=vi.fn(async()=>response());
    const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    const provider=createPersistingSeyeonAiProviderV1({
      config:{apiKey:key,model:'test-model',fetchImpl},
      runner,getBinding:()=>binding,
    });
    await expect(provider.generate(request)).resolves.toEqual({ok:true});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(startedCallId).not.toBe('');
    expect(errors.mock.calls.map(c=>c[0]))
      .toContain('MYEONGHA_SEYEON_COST_SETTLEMENT_FAILED');
    expect(JSON.stringify(errors.mock.calls)).not.toContain('database credential canary');
  });

  it('settles rejected HTTP calls without a retry or a second paid request',async()=>{
    let call='';
    const query=vi.fn().mockImplementation(async (sql:string,values:unknown[])=>{
      if(sql.includes('cmd_start_seyeon_ai_call_v1')) {
        call=String(values[4]);
        return {rows:[{callId:call}]};
      }
      const event=JSON.parse(String(values[4]));
      expect(event).toMatchObject({callId:call,outcome:'http_failure'});
      return {rows:[{callId:call,replayed:false}]};
    });
    const client={query} as unknown as PostgresTransactionQueryV1;
    const runner:SeyeonProductionSubjectTransactionRunnerV1={
      resolveSubject:async()=>({subjectId,subjectKind:'member'}),
      run:async (_subject,execute)=>execute(client,{subjectId,subjectKind:'member'}),
    };
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({error:{code:'invalid_request_error'}}),{
      status:429,headers:{'content-type':'application/json'},
    }));
    const provider=createPersistingSeyeonAiProviderV1({
      config:{apiKey:key,model:'test-model',fetchImpl},
      runner,getBinding:()=>({...binding,phase:'post_turn'}),
    });
    await expect(provider.generate({...request,purpose:'event_extraction'}))
      .rejects.toMatchObject({code:'HTTP_FAILURE'});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![1][3]).toBe('post_turn');
  });
});
