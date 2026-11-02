import {afterEach, describe, expect, it, vi} from 'vitest';
import {createGovernedSeyeonGlmRendererV1} from './governed-openrouter-seyeon-glm-renderer-v1.js';
import {SEYEON_GLM_RENDERER_COST_ESTIMATE_PRICE_V1 as price} from './openrouter-seyeon-glm-renderer-v1.js';
import type {SeyeonProductionSubjectTransactionRunnerV1} from './seyeon-production-subject-transaction-v1.js';
import type {SeyeonAiGovernorAdmissionV1} from './postgres-seyeon-ai-cost-ledger-v1.js';

const binding = {
  subjectId:'a1111111-1111-4111-8111-111111111111',
  turnId:'a2222222-2222-4222-8222-222222222222',
  attemptId:'a3333333-3333-4333-8333-333333333333',
  phase:'chat' as const,
};
const request = {
  contractVersion:'seyeon-structured-provider-v2' as const,
  purpose:'dialogue_render' as const,
  instructions:'Respond to the user in Korean.',
  input:{recentConversation:[{role:'user',text:'안녕'}]},
  responseSchema:{type:'object',additionalProperties:false,
    properties:{utterance:{type:'string'}},required:['utterance']},
};
const approvedPolicy = {
  policyVersion:'seyeon-glm53flash-governed-v1',
  providerKey:price.providerKey,
  modelKey:price.modelKey,
  priceQuote:price,
  allowedPurposes:['dialogue_render'] as const,
  contextWindowTokens:262_144,
  maximumInputTokens:20_000,
  maximumOutputTokens:1536,
  maximumSerializedRequestBytes:131_072,
};

function setup(options?: {
  certifiedBound?: number | null;
  denyStart?: boolean;
  denyReceipt?: boolean;
  outputPromptTokens?: number;
}) {
  const order:string[] = [];
  const bound = options?.certifiedBound === undefined ? 2000 : options.certifiedBound;
  const query = vi.fn(async (sql:string, args:unknown[]) => {
    const id = args[4];
    if (sql.includes('cmd_governed_start_seyeon_ai_call_v1')) {
      order.push('reserve');
      if (options?.denyStart) throw Error('budget exhausted');
      const input=Number(args[10]), output=Number(args[11]);
      return {rows:[{callId:id,ceilingMicroUsd:String(Math.ceil(
        (input * price.inputMicroUsdPerMillion+
          output * price.outputMicroUsdPerMillion)/1_000_000)),
        bucketUtcDate:'2026-10-31'}]};
    }
    if (sql.includes('cmd_store_seyeon_provider_receipt_v1')) {
      order.push('receipt');
      if (options?.denyReceipt) throw Error('receipt unavailable');
      return {rows:[{callId:JSON.parse(String(args[4])).callId,replayed:false}]};
    }
    if (sql.includes('cmd_governed_settle_seyeon_ai_call_v1')) {
      order.push('settle');
      return {rows:[{callId:JSON.parse(String(args[4])).callId,replayed:false,occupiedMicroUsd:'900',overCeiling:false}]};
    }
    throw Error('Unexpected cost SQL');
  });
  const runner = {
    run:async (_id:string, callback:(client:{query:typeof query})=>Promise<unknown>)=>
      callback({query}),
  } as unknown as SeyeonProductionSubjectTransactionRunnerV1;
  const governor:SeyeonAiGovernorAdmissionV1 = {
    policy:approvedPolicy,
    certifiedInputTokenUpperBound:vi.fn(async () => bound),
  };
  const fetchImpl = vi.fn(async () => {
    order.push('paid');
    return new Response(JSON.stringify({
      model:price.modelKey,choices:[{finish_reason:'stop',
        message:{role:'assistant',content:'{"utterance":"안녕하세요."}'}}],
      usage:{prompt_tokens:options?.outputPromptTokens ?? 1800,completion_tokens:60},
    }),{status:200,headers:{'content-type':'application/json'}});
  });
  vi.stubGlobal('fetch',fetchImpl);
  const provider = createGovernedSeyeonGlmRendererV1({
    config:{apiKey:'sk-or-synthetic-test-123456789'},
    governor,runner,getBinding:()=>binding,
  });
  return {provider,order,query,fetchImpl,governor};
}

afterEach(()=>vi.unstubAllGlobals());

describe('GLM ENFORCE governed reservation + receipt + settlement',()=>{
  it('authorizes exactly one paid reply only after reservation and settlement',async()=>{
    const s=setup();
    await expect(s.provider.generate(request)).resolves.toEqual({utterance:'안녕하세요.'});
    expect(s.order).toEqual(['reserve','paid','receipt','settle']);
    expect(s.fetchImpl).toHaveBeenCalledOnce();
    expect(s.governor.certifiedInputTokenUpperBound).toHaveBeenCalledOnce();
  });
  it('rejects absent certified bounds before a paid request',async()=>{
    const s=setup({certifiedBound:null});
    await expect(s.provider.generate(request)).rejects.toThrow();
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.order).toEqual([]);
  });
  it('rejects DB budget exhaustion before any paid request',async()=>{
    const s=setup({denyStart:true});
    await expect(s.provider.generate(request)).rejects.toThrow('budget exhausted');
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.order).toEqual(['reserve']);
  });
  it('denies a completed reply when cost receipt is unavailable, without retry',async()=>{
    const s=setup({denyReceipt:true});
    await expect(s.provider.generate(request)).rejects.toThrow('receipt unavailable');
    expect(s.order).toEqual(['reserve','paid','receipt']);
    expect(s.fetchImpl).toHaveBeenCalledOnce();
  });
  it('charges the observed usage then denies replies outside input ceiling',async()=>{
    const s=setup({outputPromptTokens:2500});
    await expect(s.provider.generate(request)).rejects.toThrow('outside the admitted limit');
    expect(s.order).toEqual(['reserve','paid','receipt','settle']);
  });
  it('rejects ungoverned endpoints and rate-card drift at construction',()=>{
    const s=setup();
    expect(()=>createGovernedSeyeonGlmRendererV1({
      config:{apiKey:'sk-or-synthetic-test-123456789',fetchImpl:fetch},
      governor:s.governor,
      runner:{run:async()=>null} as unknown as SeyeonProductionSubjectTransactionRunnerV1,
      getBinding:()=>binding,
    })).toThrow('server-approved');
  });
});
