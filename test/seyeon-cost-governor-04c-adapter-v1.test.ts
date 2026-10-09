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
      expect(order).toEqual(['certify','admit','fetch','settle']);
      expect(query).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(query.mock.calls)).not.toContain('Synthetic 한글 text');
      expect(JSON.stringify(query.mock.calls)).not.toContain('synthetic-test-placeholder');
    } finally { info.mockRestore(); }
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
});
