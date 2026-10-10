import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonProductionChatGovernorsV1,
  createSeyeonProductionPostTurnGovernorV1,
} from '../apps/api/src/seyeon-production-governor-factory-v1.js';
import {
  createProductionSeyeonPostTurnWorkerRuntimeV1,
} from '../apps/api/src/production-seyeon-post-turn-worker-runtime-v1.js';
import type {
  SeyeonCostGovernorModelPolicyV1,
} from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';

const native = Object.freeze({ apiKey:'sk-synthetic-offline-only-1234567890',model:'synthetic' });
const policy = (allowedPurposes: SeyeonCostGovernorModelPolicyV1['allowedPurposes']):
  SeyeonCostGovernorModelPolicyV1 => ({
  policyVersion:'offline-policy-v1',providerKey:'openai-responses',modelKey:'synthetic',
  allowedPurposes,
  priceQuote:{priceVersion:'offline-rate-v1',providerKey:'openai-responses',
    modelKey:'synthetic',inputMicroUsdPerMillion:1000000,
    cachedInputMicroUsdPerMillion:250000,outputMicroUsdPerMillion:4000000},
  contextWindowTokens:2000,maximumInputTokens:1200,
  maximumOutputTokens:800,maximumSerializedRequestBytes:20000,
});
const approval = () => ({
  policies:{
    preflight:policy(['integrity_classification','disclosure_classification']),
    interpreter:policy(['turn_interpretation']),
    renderer:policy(['dialogue_render']),reviewer:policy(['semantic_review']),
  },
  reservedHeadroomTokens:64,
});
const build = (
  input: Partial<Parameters<typeof createSeyeonProductionChatGovernorsV1>[0]> = {},
) => createSeyeonProductionChatGovernorsV1({
  baseProviderConfig:native,approval:approval(),...input,
});

describe('PR-04D3B1 trusted Production Governor assembly (offline)',()=>{
  it('binds four roles and approved cost/outputs to official counter without external I/O',()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('must never call'));
    try{
      const setup=build();
      for(const role of ['preflight','interpreter','renderer','reviewer'] as const){
        const config=setup.roleProviderConfigs[role];
        expect(config.model).toBe('synthetic');
        expect(config.maxOutputTokens).toBe(800);
        expect(config.priceQuote?.priceVersion).toBe('offline-rate-v1');
        expect(setup.costGovernorForRole(role,config).policy.modelKey).toBe('synthetic');
      }
      expect(()=>setup.costGovernorForRole('renderer',native))
        .toThrow('identity drift');
      expect(fetchMock).not.toHaveBeenCalled();
    }finally{fetchMock.mockRestore();}
  });

  it('fails closed on any omitted role, wrong purpose, model or fake transport',()=>{
    const ready=approval();
    expect(()=>build({approval:{...ready,
      policies:{preflight:ready.policies.preflight,
        interpreter:ready.policies.interpreter,renderer:ready.policies.renderer},
    } as unknown as typeof ready})).toThrow('four approved');
    expect(()=>build({approval:{...ready,policies:{...ready.policies,
      reviewer:policy(['event_extraction'])}}})).toThrow('approved native');
    for(const bad of [
      {...native,model:'unapproved'},
      {...native,origin:'https://ai-gateway.vercel.sh'},
      {...native,fetchImpl:vi.fn()},
      {...native,beforeDispatch:vi.fn()},
      {...native,maxOutputTokens:99},
    ]){
      expect(()=>build({baseProviderConfig:bad})).toThrow('approved native');
    }
    expect(()=>build({baseProviderConfig:{...native,
      priceQuote:{...ready.policies.renderer.priceQuote,
        outputMicroUsdPerMillion:3}}})).toThrow('divergent Provider price');
    expect(()=>build({approval:{...ready,reservedHeadroomTokens:0}}))
      .toThrow('server-owned OpenAI policy');
  });

  it('requires an approved purpose for Post-turn and rejects injected Governor',()=>{
    const approved=createSeyeonProductionPostTurnGovernorV1({
      providerConfig:native,policy:policy(['event_extraction']),
      reservedHeadroomTokens:64,
    });
    expect(approved.providerConfig.maxOutputTokens).toBe(800);
    expect(approved.costGovernor.policy.allowedPurposes).toContain('event_extraction');
    expect(()=>createSeyeonProductionPostTurnGovernorV1({
      providerConfig:native,policy:policy(['dialogue_render']),
      reservedHeadroomTokens:64,
    })).toThrow('approved native role');
    const dbConfig={} as Parameters<typeof createProductionSeyeonPostTurnWorkerRuntimeV1>[0]['databaseConfig'];
    expect(()=>createProductionSeyeonPostTurnWorkerRuntimeV1({
      databaseConfig:dbConfig,providerConfig:native,governorMode:'ENFORCE',
      costGovernor:approved.costGovernor,
    })).toThrow('externally supplied Governor');
    expect(()=>createProductionSeyeonPostTurnWorkerRuntimeV1({
      databaseConfig:dbConfig,providerConfig:native,governorMode:'ENFORCE',
    })).toThrow('server-owned');
  });
});
