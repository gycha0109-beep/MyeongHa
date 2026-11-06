import { describe, expect, it, vi } from 'vitest';
import {
  createPersistingSeyeonAiProviderV1,
  startGovernedSeyeonAiCallV1,
  type SeyeonAiCostLedgerBindingV1,
} from '../apps/api/src/postgres-seyeon-ai-cost-ledger-v1.js';
import type {
  SeyeonProductionSubjectTransactionRunnerV1,
} from '../apps/api/src/seyeon-production-subject-transaction-v1.js';
import type { PostgresTransactionQueryV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SeyeonStructuredProviderRequestV2 } from '../apps/api/src/seyeon-character-runtime-v2.js';
import type { SeyeonCostGovernorModelPolicyV1 } from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';

const subjectId = '11111111-1111-4111-8111-111111111111';
const turnId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const callId = '44444444-4444-4444-8444-444444444444';
const binding: SeyeonAiCostLedgerBindingV1 = {
  subjectId, turnId, attemptId, phase: 'chat',
};
const policy: SeyeonCostGovernorModelPolicyV1 = {
  policyVersion: 'offline-policy-v1',
  providerKey: 'openai-responses',
  modelKey: 'test-model',
  allowedPurposes: ['dialogue_render'],
  priceQuote: {
    priceVersion: 'offline-rate-v1',
    providerKey: 'openai-responses',
    modelKey: 'test-model',
    inputMicroUsdPerMillion: 1_000_000,
    cachedInputMicroUsdPerMillion: 250_000,
    outputMicroUsdPerMillion: 4_000_000,
  },
  contextWindowTokens: 2000,
  maximumInputTokens: 1200,
  maximumOutputTokens: 800,
  maximumSerializedRequestBytes: 20000,
};
const request = {
  contractVersion: 'seyeon-structured-provider-v2' as const,
  purpose: 'dialogue_render' as const,
  instructions: 'Offline synthetic instructions',
  input: { note: 'Synthetic 한글 text' },
  responseSchema: {
    type: 'object', additionalProperties: false,
    required: ['ok'], properties: { ok: { type: 'boolean' } },
  },
};
const response = () => Response.json({
  status: 'completed',
  output: [{ type: 'message', content: [{type:'output_text',text:'{"ok":true}'}] }],
  usage: {
    input_tokens: 50, output_tokens: 20,
    input_tokens_details: {cached_tokens: 0},
    output_tokens_details: {reasoning_tokens: 0},
  },
});
const config = {
  apiKey: 'sk-synthetic-test-placeholder-123456',
  model: 'test-model', maxOutputTokens: 800, priceQuote: policy.priceQuote,
};

function runner(query: ReturnType<typeof vi.fn>): SeyeonProductionSubjectTransactionRunnerV1 {
  const client = {query} as unknown as PostgresTransactionQueryV1;
  return {
    resolveSubject: async () => ({subjectId,subjectKind:'member'}),
    run: async (_subject,execute) => execute(client,{subjectId,subjectKind:'member'}),
  };
}
describe('Se-yeon 04C governed provider adapter (fake HTTP and fake DB)', () => {
  it('measures final upstream JSON bytes and admits a certified bound before HTTP', async () => {
    const order: string[] = [];
    let admittedId = '';
    const query = vi.fn(async (sql: string, values: unknown[]) => {
      if (sql.includes('cmd_governed_start_seyeon_ai_call_v1')) {
        order.push('admit');
        admittedId = String(values[4]);
        expect(values.slice(0,12)).toEqual([
          subjectId,turnId,attemptId,'chat',admittedId,
          'dialogue_render','openai-responses','test-model',
          'offline-policy-v1','offline-rate-v1',500,800,
        ]);
        expect(Number(values[12])).toBeGreaterThan(100);
        return {rows:[{
          callId:admittedId,ceilingMicroUsd:'3700',bucketUtcDate:'2026-10-10',
        }]};
      }
      if (sql.includes('cmd_store_seyeon_provider_receipt_v1')) {
        order.push('store');
        const event = JSON.parse(String(values[4]));
        expect(event).toMatchObject({
          callId:admittedId,priceVersion:'offline-rate-v1',
          outcome:'response_received',costStatus:'estimated',
        });
        return {rows:[{callId:admittedId,replayed:false}]};
      }
      if (sql.includes('cmd_governed_settle_seyeon_ai_call_v1')) {
        order.push('settle');
        const event = JSON.parse(String(values[4]));
        expect(event).toMatchObject({
          callId:admittedId,priceVersion:'offline-rate-v1',
        });
        return {rows:[{
          callId:admittedId,replayed:false,
          occupiedMicroUsd:'130',overCeiling:false,
        }]};
      }
      throw new Error('unexpected SQL');
    });
    const bound = vi.fn(async (_request: SeyeonStructuredProviderRequestV2, bytes:number) => {
      order.push('certify');
      expect(bytes).toBeGreaterThan(100);
      return 500;
    });
    const fetchImpl = vi.fn(async (_url: string,init: RequestInit) => {
      order.push('fetch');
      expect(new Headers(init.headers).get('x-client-request-id')).toBe(admittedId);
      const bytes = new TextEncoder().encode(String(init.body)).byteLength;
      expect(bytes).toBe(bound.mock.calls[0]![1]);
      expect(JSON.parse(String(init.body)).max_output_tokens).toBe(800);
      return response();
    });
    const provider = createPersistingSeyeonAiProviderV1({
      config: {...config,fetchImpl},
      runner: runner(query),
      getBinding: () => binding,
      governor: {policy,certifiedInputTokenUpperBound:bound},
    });
    const info = vi.spyOn(console,'info').mockImplementation(()=>undefined);
    try {
      await expect(provider.generate(request)).resolves.toEqual({ok:true});
      expect(order).toEqual(['certify','admit','fetch','store','settle']);
      expect(query).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(query.mock.calls)).not.toContain('Synthetic 한글 text');
      expect(JSON.stringify(query.mock.calls)).not.toContain('synthetic-test-placeholder');
    } finally { info.mockRestore(); }
  });

  it('W112 pins governed model, price and count authority against post-assembly mutation', async () => {
    const order:string[]=[];
    const mutablePolicy:SeyeonCostGovernorModelPolicyV1={
      ...policy,
      allowedPurposes:[...policy.allowedPurposes],
      priceQuote:{...policy.priceQuote},
    };
    const certify=vi.fn(async ()=>{
      order.push('certify');
      return 500;
    });
    const mutableGovernor={
      policy:mutablePolicy,
      certifiedInputTokenUpperBound:certify,
    };
    const fetchImpl=vi.fn(async (_url:string,init:RequestInit)=>{
      order.push('fetch');
      const body=JSON.parse(String(init.body));
      expect(body.model).toBe('test-model');
      expect(body.max_output_tokens).toBe(800);
      return response();
    });
    const mutableConfig={
      ...config,priceQuote:{...config.priceQuote},fetchImpl,
    };
    let reservedCall='';
    const query=vi.fn(async (sql:string,values:unknown[])=>{
      if(sql.includes('cmd_governed_start_seyeon_ai_call_v1')){
        order.push('admit');
        reservedCall=String(values[4]);
        expect(values.slice(5,12)).toEqual([
          'dialogue_render','openai-responses','test-model',
          'offline-policy-v1','offline-rate-v1',500,800,
        ]);
        return {rows:[{
          callId:reservedCall,ceilingMicroUsd:'3700',bucketUtcDate:'2026-11-06',
        }]};
      }
      if(sql.includes('cmd_store_seyeon_provider_receipt_v1')){
        order.push('store');
        return {rows:[{callId:JSON.parse(String(values[4])).callId,replayed:false}]};
      }
      if(sql.includes('cmd_governed_settle_seyeon_ai_call_v1')){
        order.push('settle');
        return {rows:[{
          callId:JSON.parse(String(values[4])).callId,replayed:false,
          occupiedMicroUsd:'130',overCeiling:false,
        }]};
      }
      throw Error('W112 unexpected SQL');
    });
    const provider=createPersistingSeyeonAiProviderV1({
      config:mutableConfig,runner:runner(query),getBinding:()=>binding,
      governor:mutableGovernor,
    });
    // TypeScript readonly is NOT a runtime trust boundary. A caller may
    // mutate its object references while the asynchronous turn is pending.
    Object.assign(mutablePolicy,{
      policyVersion:'altered-after-assembly',
      maximumInputTokens:1,maximumOutputTokens:1,
    });
    (mutablePolicy.allowedPurposes as string[]).push('event_extraction');
    Object.assign(mutablePolicy.priceQuote,{outputMicroUsdPerMillion:1});
    Object.assign(mutableConfig,{model:'altered-model',maxOutputTokens:1});
    Object.assign(mutableConfig.priceQuote,{outputMicroUsdPerMillion:1});
    Object.assign(mutableGovernor,{
      certifiedInputTokenUpperBound:async ()=>null,
    });
    const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    const info=vi.spyOn(console,'info').mockImplementation(()=>undefined);
    try{
      await expect(provider.generate(request)).resolves.toEqual({ok:true});
      expect(certify).toHaveBeenCalledOnce();
      expect(order).toEqual(['certify','admit','fetch','store','settle']);
      expect(query).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(query.mock.calls)).not.toContain('altered-after-assembly');
      expect(JSON.stringify(query.mock.calls)).not.toContain('altered-model');
      expect(errors).not.toHaveBeenCalled();
    }finally{
      errors.mockRestore();
      info.mockRestore();
    }
  });

  it('refuses missing or uncertified token bound before any DB write or fetch', async () => {
    const query = vi.fn();
    const fetchImpl = vi.fn(async () => response());
    const provider = createPersistingSeyeonAiProviderV1({
      config: {...config,fetchImpl},
      runner: runner(query),getBinding:()=>binding,
      governor: {policy,certifiedInputTokenUpperBound:async()=>null},
    });
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(query).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses DB budget denial, with no paid network request', async () => {
    const query = vi.fn().mockRejectedValue(new Error('private-db-credentials-canary'));
    const fetchImpl = vi.fn(async()=>response());
    const provider = createPersistingSeyeonAiProviderV1({
      config:{...config,fetchImpl}, runner:runner(query),
      getBinding:()=>binding,
      governor:{policy,certifiedInputTokenUpperBound:()=>500},
    });
    await expect(provider.generate(request)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
  });

  it('refuses config mismatches before constructing a governed provider', () => {
    const query=vi.fn();
    const input={runner:runner(query),getBinding:()=>binding,
      governor:{policy,certifiedInputTokenUpperBound:()=>500}};
    expect(()=>createPersistingSeyeonAiProviderV1({
      ...input,config:{apiKey:config.apiKey,model:config.model,priceQuote:config.priceQuote},
    })).toThrow('server price/output policy');
    expect(()=>createPersistingSeyeonAiProviderV1({
      ...input,config:{...config,priceQuote:{...config.priceQuote,
        outputMicroUsdPerMillion:3}},
    })).toThrow('server price/output policy');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an inconsistent DB cost receipt before any dispatch', async () => {
    const query=vi.fn().mockResolvedValue({rows:[{
      callId,ceilingMicroUsd:'3699',bucketUtcDate:'2026-10-10',
    }]});
    await expect(startGovernedSeyeonAiCallV1(
      {query} as unknown as PostgresTransactionQueryV1,
      binding,{callId,purpose:'dialogue_render',providerKey:'openai-responses',
        modelKey:'test-model',requestBodyBytes:500,
        quote:{policyVersion:'offline-policy-v1',rateCardVersion:'offline-rate-v1',
          providerKey:'openai-responses',modelKey:'test-model',purpose:'dialogue_render',
          inputCeilingTokens:500,outputCeilingTokens:800,ceilingMicroUsd:3700},
      },
    )).rejects.toThrow('DB receipt');
  });

  it('W110 rejects malformed governed policy/rate/role metadata before any DB reservation', async () => {
    const valid: Parameters<typeof startGovernedSeyeonAiCallV1>[2] = {
      callId,purpose:'dialogue_render',providerKey:'openai-responses',
      modelKey:'test-model',requestBodyBytes:500,
      quote:{
        policyVersion:'offline-policy-v1',rateCardVersion:'offline-rate-v1',
        providerKey:'openai-responses',modelKey:'test-model',
        purpose:'dialogue_render',inputCeilingTokens:500,
        outputCeilingTokens:800,ceilingMicroUsd:3700,
      },
    };
    const malformed: readonly [string,unknown][] = [
      ['no policy version',{...valid,quote:{...valid.quote,policyVersion:''}}],
      ['oversized policy version',{...valid,quote:{...valid.quote,
        policyVersion:'p'.repeat(129)}}],
      ['SQL-like rate version',{...valid,quote:{...valid.quote,
        rateCardVersion:"v1'; drop table public.seyeon_ai_call_cost_events; --"}}],
      ['missing rate version',{...valid,quote:{...valid.quote,
        rateCardVersion:undefined}}],
      ['matched but invalid provider',{...valid,providerKey:'bad provider',
        quote:{...valid.quote,providerKey:'bad provider'}}],
      ['matched but invalid model',{...valid,modelKey:'bad model',
        quote:{...valid.quote,modelKey:'bad model'}}],
      ['matched but invalid purpose',{...valid,purpose:'dialogue_render;drop',
        quote:{...valid.quote,purpose:'dialogue_render;drop'}}],
      ['missing quote',{...valid,quote:undefined}],
      ['array quote',{...valid,quote:[]}],
      ['zero byte request',{...valid,requestBodyBytes:0}],
    ];
    const query=vi.fn(async (_sql:string,_params:unknown[])=>({
      rows:[] as Array<{callId:string;ceilingMicroUsd:string;bucketUtcDate:string}>,
    }));
    const client={query} as unknown as PostgresTransactionQueryV1;
    for(const [label,input] of malformed){
      await expect(startGovernedSeyeonAiCallV1(
        client,binding,input as Parameters<typeof startGovernedSeyeonAiCallV1>[2],
      ),label).rejects.toThrow('authoritative bounded quote');
      expect(query,label).not.toHaveBeenCalled();
    }
    // The unchanged, valid shape still reaches only the governed SQL
    // reservation with parameterized server-owned price/policy versions.
    query.mockResolvedValueOnce({rows:[{
      callId,ceilingMicroUsd:'3700',bucketUtcDate:'2026-11-06',
    }]});
    await expect(startGovernedSeyeonAiCallV1(
      client,binding,valid,
    )).resolves.toMatchObject({callId,ceilingMicroUsd:3700n});
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'cmd_governed_start_seyeon_ai_call_v1',
    );
    expect(query.mock.calls[0]?.[1]?.slice(8,10)).toEqual([
      'offline-policy-v1','offline-rate-v1',
    ]);
  });

  it('holds the full reservation when the Provider result cannot commit, with no second inference', async () => {
    const order:string[]=[];
    let admittedId='';
    const query=vi.fn(async (sql:string,values:unknown[])=>{
      if(sql.includes('cmd_governed_start_seyeon_ai_call_v1')) {
        admittedId=String(values[4]);
        order.push('admit');
        return {rows:[{callId:admittedId,ceilingMicroUsd:'3700',bucketUtcDate:'2026-10-10'}]};
      }
      if(sql.includes('cmd_store_seyeon_provider_receipt_v1')) {
        order.push('store-failed');
        expect(JSON.parse(String(values[4]))).toMatchObject({
          callId:admittedId, outcome:'response_received', costStatus:'estimated',
        });
        throw new Error('secret-db-error-no-leak');
      }
      throw new Error('Settlement is forbidden without committed Provider evidence.');
    });
    const fetchImpl=vi.fn(async()=>{
      order.push('fetch');
      return response();
    });
    const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    const info=vi.spyOn(console,'info').mockImplementation(()=>undefined);
    try {
      const provider=createPersistingSeyeonAiProviderV1({
        config:{...config,fetchImpl},runner:runner(query),getBinding:()=>binding,
        governor:{policy,certifiedInputTokenUpperBound:()=>500},
      });
      // Paid inference may have completed, but missing durable evidence must
      // never let its response advance to the Chat Commit or successful reply.
      await expect(provider.generate(request)).rejects.toThrow(
        'Governed Provider outcome receipt was not persisted; Chat Commit denied.',
      );
      expect(order).toEqual(['admit','fetch','store-failed']);
      expect(query).toHaveBeenCalledTimes(2);
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(errors.mock.calls.map(x=>x[0])).toContain('MYEONGHA_SEYEON_PROVIDER_RECEIPT_UNPERSISTED');
      expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-db-error-no-leak');
    } finally {
      errors.mockRestore();
      info.mockRestore();
    }
  });

  for (const replayCase of ['provider_receipt','governed_settlement'] as const) {
    it('W113 refuses ' + replayCase +
      ' idempotent DB replay as proof of a new paid reply', async () => {
      const order:string[]=[];
      let reservedCall='';
      const query=vi.fn(async (sql:string,values:unknown[])=>{
        if(sql.includes('cmd_governed_start_seyeon_ai_call_v1')){
          order.push('admit');
          reservedCall=String(values[4]);
          return {rows:[{
            callId:reservedCall,ceilingMicroUsd:'3700',
            bucketUtcDate:'2026-11-06',
          }]};
        }
        if(sql.includes('cmd_store_seyeon_provider_receipt_v1')){
          order.push('store');
          expect(JSON.parse(String(values[4])).callId).toBe(reservedCall);
          return {rows:[{
            callId:reservedCall,replayed:replayCase==='provider_receipt',
          }]};
        }
        if(sql.includes('cmd_governed_settle_seyeon_ai_call_v1')){
          order.push('settle');
          expect(replayCase).toBe('governed_settlement');
          return {rows:[{
            callId:reservedCall,replayed:true,
            occupiedMicroUsd:'130',overCeiling:false,
          }]};
        }
        throw new Error('Unexpected W113 SQL');
      });
      const fetchImpl=vi.fn(async()=>{
        order.push('fetch');
        return response();
      });
      const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
      const info=vi.spyOn(console,'info').mockImplementation(()=>undefined);
      try{
        const provider=createPersistingSeyeonAiProviderV1({
          config:{...config,fetchImpl},
          runner:runner(query),getBinding:()=>binding,
          governor:{policy,certifiedInputTokenUpperBound:()=>500},
        });
        await expect(provider.generate(request)).rejects.toThrow(
          replayCase==='provider_receipt'
            ? 'Governed Provider outcome receipt was not persisted; Chat Commit denied.'
            : 'Governed cost settlement was not confirmed; Chat Commit denied.',
        );
        expect(order).toEqual(replayCase==='provider_receipt'
          ? ['admit','fetch','store']
          : ['admit','fetch','store','settle']);
        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(query).toHaveBeenCalledTimes(
          replayCase==='provider_receipt' ? 2 : 3,
        );
        expect(errors.mock.calls.map(x=>x[0])).toContain(
          replayCase==='provider_receipt'
            ? 'MYEONGHA_SEYEON_PROVIDER_RECEIPT_REPLAYED'
            : 'MYEONGHA_SEYEON_COST_SETTLEMENT_REPLAYED',
        );
        expect(JSON.stringify(errors.mock.calls)).not.toContain(
          'sk-synthetic-test-placeholder',
        );
      }finally{
        errors.mockRestore();
        info.mockRestore();
      }
    });
  }

  for (const settlementCase of ['db_failure','over_ceiling'] as const) {
    it('blocks a successful Provider answer when governed settlement is ' + settlementCase, async () => {
      const order: string[] = [];
      const fetchImpl = vi.fn(async () => { order.push('fetch'); return response(); });
      const query = vi.fn(async (sql:string, values:unknown[]) => {
        const actualId = String(values[4]);
        if (sql.includes('cmd_governed_start_seyeon_ai_call_v1')) {
          order.push('admit');
          return {rows:[{callId:actualId,ceilingMicroUsd:'3700',bucketUtcDate:'2026-10-10'}]};
        }
        if (sql.includes('cmd_store_seyeon_provider_receipt_v1')) {
          order.push('store');
          return {rows:[{callId:JSON.parse(String(values[4])).callId,replayed:false}]};
        }
        if (sql.includes('cmd_governed_settle_seyeon_ai_call_v1')) {
          order.push('settle');
          if (settlementCase === 'db_failure') throw new Error('secret-settlement-db-canary');
          return {rows:[{callId:JSON.parse(String(values[4])).callId,replayed:false,
            occupiedMicroUsd:'3701',overCeiling:true}]};
        }
        throw new Error('Unexpected SQL');
      });
      const errors = vi.spyOn(console,'error').mockImplementation(()=>undefined);
      const info = vi.spyOn(console,'info').mockImplementation(()=>undefined);
      try {
        const provider = createPersistingSeyeonAiProviderV1({
          config:{...config,fetchImpl},runner:runner(query),getBinding:()=>binding,
          governor:{policy,certifiedInputTokenUpperBound:()=>500},
        });
        await expect(provider.generate(request)).rejects.toThrow(
          'Governed cost settlement was not confirmed; Chat Commit denied.',
        );
        expect(order).toEqual(['admit','fetch','store','settle']);
        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(query).toHaveBeenCalledTimes(3);
        expect(errors.mock.calls.map(call=>call[0])).toContain(
          settlementCase === 'db_failure'
            ? 'MYEONGHA_SEYEON_COST_SETTLEMENT_FAILED'
            : 'MYEONGHA_SEYEON_COST_OVER_CEILING',
        );
        expect(JSON.stringify(errors.mock.calls)).not.toContain('secret-settlement-db-canary');
      } finally { errors.mockRestore(); info.mockRestore(); }
    });
  }

  for (const sample of [
    {name:'input tokens above certified upper bound',inputTokens:501,outputTokens:1,
      occupiedMicroUsd:'505',costStatus:'estimated'},
    {name:'output tokens above enforced provider cap',inputTokens:50,outputTokens:801,
      occupiedMicroUsd:'3254',costStatus:'estimated'},
    {name:'successful response with missing token usage',inputTokens:null,outputTokens:null,
      occupiedMicroUsd:'3700',costStatus:'usage_unknown'},
  ] as const) {
    it('holds ' + sample.name + ' even if total settled cost is not over ceiling', async () => {
      const order: string[] = [];
      let admittedId = '';
      const query = vi.fn(async (sql:string, values:unknown[]) => {
        if (sql.includes('cmd_governed_start_seyeon_ai_call_v1')) {
          admittedId = String(values[4]);
          order.push('admit');
          return {rows:[{callId:admittedId,ceilingMicroUsd:'3700',bucketUtcDate:'2026-10-10'}]};
        }
        if (sql.includes('cmd_store_seyeon_provider_receipt_v1')) {
          order.push('store');
          const event = JSON.parse(String(values[4]));
          expect(event).toMatchObject({
            callId:admittedId,outcome:'response_received',costStatus:sample.costStatus,
            inputTokens:sample.inputTokens,outputTokens:sample.outputTokens,
          });
          return {rows:[{callId:admittedId,replayed:false}]};
        }
        if (sql.includes('cmd_governed_settle_seyeon_ai_call_v1')) {
          order.push('settle');
          return {rows:[{callId:admittedId,replayed:false,
            occupiedMicroUsd:sample.occupiedMicroUsd,overCeiling:false}]};
        }
        throw new Error('Unexpected SQL');
      });
      const fetchImpl = vi.fn(async () => {
        order.push('fetch');
        return Response.json({
          status:'completed',
          output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}],
          ...(sample.inputTokens === null ? {} : {
            usage:{input_tokens:sample.inputTokens,output_tokens:sample.outputTokens,
              input_tokens_details:{cached_tokens:0},
              output_tokens_details:{reasoning_tokens:0}},
          }),
        });
      });
      const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
      const info=vi.spyOn(console,'info').mockImplementation(()=>undefined);
      try {
        const provider=createPersistingSeyeonAiProviderV1({
          config:{...config,fetchImpl},runner:runner(query),getBinding:()=>binding,
          governor:{policy,certifiedInputTokenUpperBound:()=>500},
        });
        await expect(provider.generate(request)).rejects.toThrow(
          'Governed Provider token ceiling evidence failed; Chat Commit denied.',
        );
        expect(order).toEqual(['admit','fetch','store','settle']);
        expect(query).toHaveBeenCalledTimes(3);
        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(JSON.stringify(errors.mock.calls)).not.toContain('Synthetic 한글 text');
      } finally { errors.mockRestore(); info.mockRestore(); }
    });
  }

  it('stores an unknown-usage timeout before settling conservatively', async () => {
    const order:string[]=[];
    let admittedId='';
    const query=vi.fn(async (sql:string,values:unknown[])=>{
      if(sql.includes('cmd_governed_start_seyeon_ai_call_v1')) {
        admittedId=String(values[4]);order.push('admit');
        return {rows:[{callId:admittedId,ceilingMicroUsd:'3700',bucketUtcDate:'2026-10-10'}]};
      }
      if(sql.includes('cmd_store_seyeon_provider_receipt_v1')) {
        const event=JSON.parse(String(values[4]));
        expect(event).toMatchObject({
          callId:admittedId,outcome:'timeout',costStatus:'usage_unknown',
          estimatedCostMicroUsd:null,
        });
        order.push('store');
        return {rows:[{callId:admittedId,replayed:false}]};
      }
      if(sql.includes('cmd_governed_settle_seyeon_ai_call_v1')) {
        order.push('settle');
        return {rows:[{callId:admittedId,replayed:false,
          occupiedMicroUsd:'3700',overCeiling:false}]};
      }
      throw new Error('Unexpected database operation');
    });
    const fetchImpl=vi.fn(async(_url:string,init:RequestInit)=>{
      order.push('fetch');
      // Trigger the local AbortController only; no real external request.
      return await new Promise<Response>((_resolve,reject)=>{
        init.signal?.addEventListener('abort',()=>reject(new Error('timeout fixture')),{once:true});
      });
    });
    const errors=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    const info=vi.spyOn(console,'info').mockImplementation(()=>undefined);
    try {
      const provider=createPersistingSeyeonAiProviderV1({
        config:{...config,fetchImpl,timeoutMs:5},runner:runner(query),getBinding:()=>binding,
        governor:{policy,certifiedInputTokenUpperBound:()=>500},
      });
      await expect(provider.generate(request)).rejects.toMatchObject({code:'TIMEOUT'});
      expect(order).toEqual(['admit','fetch','store','settle']);
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(query).toHaveBeenCalledTimes(3);
    } finally { errors.mockRestore(); info.mockRestore(); }
  });
});
