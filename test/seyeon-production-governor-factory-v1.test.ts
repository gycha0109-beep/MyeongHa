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
    // Role policies must be exact, never a superset of the role's
    // permitted purposes: renderer must not inherit worker/preflight rights.
    expect(()=>build({approval:{...ready,policies:{...ready.policies,
      renderer:policy(['dialogue_render','event_extraction'])}}}))
      .toThrow('approved native');
    expect(()=>build({approval:{...ready,policies:{...ready.policies,
      preflight:policy(['integrity_classification','disclosure_classification',
        'turn_interpretation'])}}}))
      .toThrow('approved native');
    expect(()=>build({approval:{...ready,policies:{...ready.policies,
      interpreter:policy(['turn_interpretation','semantic_review'])}}}))
      .toThrow('approved native');
    for(const bad of [
      {...native,model:'unapproved'},
      {...native,origin:'https://ai-gateway.vercel.sh'},
      {...native,fetchImpl:vi.fn()},
      {...native,beforeDispatch:vi.fn()},
      {...native,meteredBeforeDispatch:vi.fn()},
      {...native,meteredAfterOutcome:vi.fn()},
      {...native,observeMetric:vi.fn()},
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

  it('pins immutable Chat and Post-turn rate cards, role grants and token budgets',()=>{
    const ready = approval();
    const setup = build({approval:ready});
    const rendererConfig = setup.roleProviderConfigs.renderer;
    const admission = setup.costGovernorForRole('renderer', rendererConfig);
    const originalPolicy = admission.policy;
    // Source approval is TypeScript-readonly but the caller owns mutable JS.
    (ready.policies.renderer.allowedPurposes as string[]).push('event_extraction');
    Object.assign(ready.policies.renderer, {
      maximumInputTokens:1,maximumOutputTokens:1,policyVersion:'changed-after-bootstrap',
    });
    Object.assign(ready.policies.renderer.priceQuote, {outputMicroUsdPerMillion:1});
    expect(originalPolicy.allowedPurposes).toEqual(['dialogue_render']);
    expect(originalPolicy.maximumInputTokens).toBe(1200);
    expect(originalPolicy.maximumOutputTokens).toBe(800);
    expect(originalPolicy.policyVersion).toBe('offline-policy-v1');
    expect(originalPolicy.priceQuote.outputMicroUsdPerMillion).toBe(4000000);
    expect(rendererConfig.maxOutputTokens).toBe(800);
    expect(rendererConfig.priceQuote?.outputMicroUsdPerMillion).toBe(4000000);
    expect(Object.isFrozen(originalPolicy)).toBe(true);
    expect(Object.isFrozen(originalPolicy.priceQuote)).toBe(true);
    expect(Object.isFrozen(originalPolicy.allowedPurposes)).toBe(true);
    expect(() => (originalPolicy.allowedPurposes as string[]).push('semantic_review'))
      .toThrow();

    const postSource = policy(['event_extraction']);
    const postTurn = createSeyeonProductionPostTurnGovernorV1({
      providerConfig:native,policy:postSource,reservedHeadroomTokens:64,
    });
    (postSource.allowedPurposes as string[]).push('dialogue_render');
    Object.assign(postSource, {maximumOutputTokens:1});
    Object.assign(postSource.priceQuote, {inputMicroUsdPerMillion:1});
    expect(postTurn.costGovernor.policy.allowedPurposes).toEqual(['event_extraction']);
    expect(postTurn.costGovernor.policy.maximumOutputTokens).toBe(800);
    expect(postTurn.costGovernor.policy.priceQuote.inputMicroUsdPerMillion).toBe(1000000);
    expect(postTurn.providerConfig.priceQuote?.inputMicroUsdPerMillion).toBe(1000000);
    expect(Object.isFrozen(postTurn.costGovernor.policy.priceQuote)).toBe(true);
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
    expect(()=>createSeyeonProductionPostTurnGovernorV1({
      providerConfig:native,policy:policy(['event_extraction','dialogue_render']),
      reservedHeadroomTokens:64,
    })).toThrow('approved native role');
    for (const hooked of [
      {...native,meteredAfterOutcome:vi.fn()},
      {...native,observeMetric:vi.fn()},
    ]) {
      expect(() => createSeyeonProductionPostTurnGovernorV1({
        providerConfig:hooked,policy:policy(['event_extraction']),
        reservedHeadroomTokens:64,
      })).toThrow('approved native role');
    }
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
