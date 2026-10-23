import { describe, expect, it, vi } from 'vitest';
import {
  assertSeyeonProductionGovernorBoundaryV1,
  SEYEON_GOVERNOR_CHAT_ROLES_V1,
} from '../apps/api/src/seyeon-production-governor-boundary-v1.js';
import { createProductionSeyeonChatRuntimeV1 } from
  '../apps/api/src/production-seyeon-chat-runtime-v1.js';
import { createProductionSeyeonPostTurnWorkerRuntimeV1 } from
  '../apps/api/src/production-seyeon-post-turn-worker-runtime-v1.js';

const base = { apiKey: 'sk-synthetic-offline-only-123456', model: 'fake-model' };
const roles = Object.fromEntries(
  SEYEON_GOVERNOR_CHAT_ROLES_V1.map(role => [role, { ...base }]),
);
const common = {
  mode: 'ENFORCE' as const,
  target: 'chat' as const,
  providerConfig: base,
  roleProviderConfigs: roles,
  governorConfigured: true,
};
describe('PR-04D3A Production Governor pre-activation gates (offline)', () => {
  it('keeps OFF backward compatible and rejects unknown modes', () => {
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, mode: 'OFF',
      provider: { generate: vi.fn() }, governorConfigured: false,
    })).not.toThrow();
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, mode: 'INVALID' as 'ENFORCE',
    })).toThrow('Unknown');
  });
  it('refuses an active Governor in OFF mode before the ordinary Subject DB can meter costs', () => {
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, mode: 'OFF',
    })).toThrow('OFF refuses an active cost Governor');
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      target: 'post_turn', mode: 'OFF',
      providerConfig: base, governorConfigured: true,
    })).toThrow('OFF refuses an active cost Governor');

    const databaseConfig = {} as Parameters<
      typeof createProductionSeyeonChatRuntimeV1
    >[0]['databaseConfig'];
    expect(() => createProductionSeyeonChatRuntimeV1({
      databaseConfig, providerConfig: base, governorMode: 'OFF',
      costGovernorForRole: () => { throw Error('must not be evaluated'); },
    })).toThrow('OFF refuses an active cost Governor');
    expect(() => createProductionSeyeonPostTurnWorkerRuntimeV1({
      databaseConfig, providerConfig: base, governorMode: 'OFF',
      costGovernor: {} as NonNullable<
        Parameters<typeof createProductionSeyeonPostTurnWorkerRuntimeV1>[0]['costGovernor']
      >,
    })).toThrow('OFF refuses an active cost Governor');
  });

  it('rejects injection, missing admission and incomplete role coverage', () => {
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, provider: { generate: vi.fn() },
    })).toThrow('server-owned');
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, governorConfigured: false,
    })).toThrow('server-owned');
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, providerConfig: undefined,
    })).toThrow('server-owned');
    for (const role of SEYEON_GOVERNOR_CHAT_ROLES_V1) {
      const incomplete = { ...roles };
      delete incomplete[role];
      expect(() => assertSeyeonProductionGovernorBoundaryV1({
        ...common, roleProviderConfigs: incomplete,
      })).toThrow('four explicit');
    }
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...common, roleProviderConfigs: ({ ...roles, injected: base } as typeof roles),
    })).toThrow('four explicit');
  });
  it('rejects custom network and pre-dispatch hooks in every role', () => {
    const malicious = [
      { ...base, origin: 'https://untrusted.example' },
      { ...base, fetchImpl: vi.fn() },
      { ...base, beforeDispatch: vi.fn() },
      { ...base, meteredBeforeDispatch: vi.fn() },
      { ...base, meteredAfterOutcome: vi.fn() },
      { ...base, observeMetric: vi.fn() },
    ];
    for (const config of malicious) {
      expect(() => assertSeyeonProductionGovernorBoundaryV1({
        ...common, providerConfig: config,
      })).toThrow('injected Provider');
      expect(() => assertSeyeonProductionGovernorBoundaryV1({
        ...common, roleProviderConfigs: { ...roles, reviewer: config },
      })).toThrow('injected Provider');
    }
    expect(() => assertSeyeonProductionGovernorBoundaryV1(common)).not.toThrow();
  });
  it('requires governed native Post-turn config', () => {
    const worker = {mode: 'ENFORCE' as const,target:'post_turn' as const,
      providerConfig: base, governorConfigured:true};
    expect(() => assertSeyeonProductionGovernorBoundaryV1(worker)).not.toThrow();
    for (const injected of [
      {...base,meteredAfterOutcome:vi.fn()},
      {...base,observeMetric:vi.fn()},
    ]) {
      expect(() => assertSeyeonProductionGovernorBoundaryV1({
        ...worker,providerConfig:injected,
      })).toThrow('injected Provider');
    }
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...worker, governorConfigured:false,
    })).toThrow('server-owned');
    expect(() => assertSeyeonProductionGovernorBoundaryV1({
      ...worker, provider:{ generate:vi.fn() },
    })).toThrow('server-owned');
  });
  it('checks real runtime factories before DB pool or model HTTP setup', () => {
    const databaseConfig = {} as Parameters<
      typeof createProductionSeyeonChatRuntimeV1
    >[0]['databaseConfig'];
    expect(() => createProductionSeyeonChatRuntimeV1({
      databaseConfig, providerConfig:base,governorMode:'ENFORCE',
      provider:{providerKey:'unmetered',modelKey:'fake-model',generate:vi.fn()},
    })).toThrow();
    expect(() => createProductionSeyeonChatRuntimeV1({
      databaseConfig, providerConfig:base,governorMode:'ENFORCE',
      roleProviderConfigs:{ preflight:base },
      costGovernorForRole: () => { throw Error('should not be called'); },
    })).toThrow('four explicit');
    expect(() => createProductionSeyeonPostTurnWorkerRuntimeV1({
      databaseConfig,providerConfig:base,governorMode:'ENFORCE',
    })).toThrow('server-owned');
  });
});
