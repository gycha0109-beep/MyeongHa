import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  createSeyeonGlmContextCapacityGovernorV1,
  SEYEON_GLM_CERTIFIED_INPUT_CAPACITY_V1,
  SEYEON_GLM_CONTEXT_CAPACITY_V1,
  SEYEON_GLM_GOVERNED_POLICY_V1,
} from '../apps/api/src/seyeon-glm-governor-approval-v1.js';
import {quoteSeyeonCostGovernorMaximumV1} from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';
import {SEYEON_SECURITY_S0_PRODUCTION_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';

describe('Se-yeon GLM production cutover stays server-owned and metered',()=>{
  it('quotes the entire provider context without guessing tokens from string length',async()=>{
    const governor=createSeyeonGlmContextCapacityGovernorV1();
    const body='{"model":"z-ai/glm-5.3-flash","messages":[]}';
    const bytes=new TextEncoder().encode(body).byteLength;
    const count=await governor.certifiedInputTokenUpperBound({} as never,bytes,body);
    expect(count).toBe(SEYEON_GLM_CERTIFIED_INPUT_CAPACITY_V1);
    expect(SEYEON_GLM_CONTEXT_CAPACITY_V1).toBe(1_048_576);
    const quote=quoteSeyeonCostGovernorMaximumV1({policy:governor.policy,
      request:{purpose:'dialogue_render',providerKey:'openrouter-chat',
        modelKey:'z-ai/glm-5.3-flash',verifiedInputTokenUpperBound:count,
        serializedRequestBytes:bytes,enforcedOutputTokenLimit:1536}});
    expect(quote.ceilingMicroUsd).toBeGreaterThan(150_000);
    expect(quote.rateCardVersion).toBe('openrouter-glm53flash-list-20261031');
  });
  it('refuses malformed byte evidence and oversized requests',async()=>{
    const governor=createSeyeonGlmContextCapacityGovernorV1();
    expect(await governor.certifiedInputTokenUpperBound({} as never,5,'{}')).toBeNull();
    expect(await governor.certifiedInputTokenUpperBound({} as never,131073,'x'.repeat(131073))).toBeNull();
  });
  it('does not allow the browser to select GLM or invoke ungoverned fallback',()=>{
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.glmRendererApproved).toBe(true);
    expect(SEYEON_GLM_GOVERNED_POLICY_V1.providerKey).toBe('openrouter-chat');
    expect(SEYEON_GLM_GOVERNED_POLICY_V1.allowedPurposes).toEqual(['dialogue_render']);
    const worker=readFileSync(new URL('../cloudflare/myeongha-worker.mjs',import.meta.url),'utf8');
    const runtime=readFileSync(new URL('../apps/api/src/production-seyeon-first-memory-node-runtime-v1.ts',import.meta.url),'utf8');
    expect(worker).toContain("typeof env?.OPENROUTER_API_KEY==='string'");
    expect(worker).toContain('glmRendererGovernor:createSeyeonGlmContextCapacityGovernorV1()');
    expect(runtime).toContain("governorMode: 'ENFORCE'");
    expect(runtime).toContain('Approved GLM renderer requires a server OpenRouter API key.');
  });
});
