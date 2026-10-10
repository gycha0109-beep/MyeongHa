import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonProductionCostPoolLeaseV1,
} from '../apps/api/src/seyeon-production-cost-pool-lease-v1.js';
import {
  createProductionSeyeonChatRuntimeV1,
} from '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import {
  createProductionSeyeonPostTurnWorkerRuntimeV1,
} from '../apps/api/src/production-seyeon-post-turn-worker-runtime-v1.js';
import {
  SEYEON_GOVERNOR_CHAT_ROLES_V1,
} from '../apps/api/src/seyeon-production-governor-boundary-v1.js';

const base = Object.freeze({
  apiKey: 'sk-synthetic-no-network-12345', model: 'offline-model',
});
const roles = Object.fromEntries(
  SEYEON_GOVERNOR_CHAT_ROLES_V1.map(role => [role, base]),
);
const ordinaryConfig = {} as Parameters<
  typeof createProductionSeyeonChatRuntimeV1
>[0]['databaseConfig'];

function source(name:string):string {
  return readFileSync(fileURLToPath(new URL(
    '../apps/api/src/'+name,import.meta.url,
  )),'utf8');
}
describe('D3B2B-3C governed cost-runner cutover remains fail-closed',()=>{
  it('OFF never acquires a governed cost credential or switches execution roles',()=>{
    expect(createSeyeonProductionCostPoolLeaseV1({mode:'OFF'})).toBeNull();
    expect(createSeyeonProductionCostPoolLeaseV1({})).toBeNull();
    expect(()=>createSeyeonProductionCostPoolLeaseV1({
      mode:'OFF',governedPool:{
        authority:'seyeon-governed-only-v1',
        connect:vi.fn(),
      },
    })).toThrow('OFF');
  });

  it('ENFORCE rejects absent governed login and an ordinary Subject pool',()=>{
    expect(()=>createSeyeonProductionCostPoolLeaseV1({
      mode:'ENFORCE',
    })).toThrow('separate Governed DB credential');
    expect(()=>createSeyeonProductionCostPoolLeaseV1({
      mode:'ENFORCE',
      governedPool:{
        authority:'ordinary-pool' as 'seyeon-governed-only-v1',
        connect:vi.fn(),
      },
    })).toThrow('non-Governed');
    expect(()=>createProductionSeyeonChatRuntimeV1({
      databaseConfig:ordinaryConfig,
      providerConfig:base,
      roleProviderConfigs:roles,
      costGovernorForRole:()=>({} as never),
      governorMode:'ENFORCE',
    })).toThrow('separate Governed DB credential');
  });

  it('server-owned Post-turn ENFORCE requires approved native metering and cost DB',()=>{
    const policy = {
      policyVersion:'offline-post-turn-v1',
      providerKey:'openai-responses' as const,
      modelKey:'offline-model',
      allowedPurposes:['event_extraction'] as const,
      priceQuote:{
        priceVersion:'offline-rate-v1',providerKey:'openai-responses' as const,
        modelKey:'offline-model',inputMicroUsdPerMillion:1000000,
        cachedInputMicroUsdPerMillion:250000,
        outputMicroUsdPerMillion:4000000,
      },
      contextWindowTokens:2000,maximumInputTokens:1200,
      maximumOutputTokens:800,maximumSerializedRequestBytes:20000,
    };
    expect(()=>createProductionSeyeonPostTurnWorkerRuntimeV1({
      databaseConfig:ordinaryConfig,providerConfig:base,
      governorMode:'ENFORCE',
      governorApproval:{policy,reservedHeadroomTokens:64},
    })).toThrow('separate Governed DB credential');
  });

  it('provider metering on Chat and Post-turn always receives costRunner',()=>{
    const chat=source('production-seyeon-chat-runtime-v1.ts');
    const worker=source('production-seyeon-post-turn-worker-runtime-v1.ts');
    for(const runtime of [chat,worker]) {
      expect(runtime).toContain('createSeyeonGovernedCostTransactionRunnerV1({');
      expect(runtime).toContain('const governedSubject = await costRunner.resolveSubject()');
      expect(runtime).toContain('runner: costRunner');
      expect(runtime).not.toMatch(/config, runner, getBinding:/u);
      expect(runtime).toContain('createSeyeonProductionCostPoolLeaseV1({');
      expect(runtime).toContain('await costPoolLease?.close()');
    }
    expect(source('production-seyeon-turn-send-runtime-v1.ts'))
      .toContain('parseSeyeonGovernedDbConfigV1({');
    expect(source('postgres-seyeon-ai-cost-ledger-v1.ts'))
      .toContain('await input.runner.run(binding.subjectId');
  });
});
