import { describe, expect, it, vi } from 'vitest';
import { createOpenAiSeyeonStructuredProviderV1 } from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

import {
  resolveProductionSeyeonProviderConfigAtRequestV1,
  resolveProductionSeyeonRoleProviderConfigsV1,
  SEYEON_PRODUCTION_PROVIDER_ROUTING_V1,
} from '../apps/api/src/production-seyeon-turn-send-runtime-v1.js';

describe('Production Seyeon provider routing', () => {
  it('accepts scoped AI Gateway models without allowing malformed model paths', () => {
    const config = {
      apiKey: 'vercel-oidc-token-12345678901234567890',
      model: 'openai/gpt-5.6-sol',
      origin: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayOrigin,
    };
    expect(createOpenAiSeyeonStructuredProviderV1(config).modelKey).toBe('openai/gpt-5.6-sol');
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      ...config,
      model: 'openai//gpt-5.6-sol',
    })).toThrow('OpenAI model identifier is invalid.');
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      ...config,
      model: '/gpt-5.6-sol',
    })).toThrow('OpenAI model identifier is invalid.');
  });

  it('prefers an explicit direct OpenAI key without consulting Vercel OIDC', async () => {
    const oidc = vi.fn(async () => 'oidc-token-that-must-not-win-1234567890');
    await expect(resolveProductionSeyeonProviderConfigAtRequestV1({
      OPENAI_API_KEY: 'sk-test-direct-key-1234567890',
      MYEONGHA_SEYEON_OPENAI_MODEL: 'gpt-5.6-terra',
    }, oidc)).resolves.toEqual({
      apiKey: 'sk-test-direct-key-1234567890',
      model: 'gpt-5.6-terra',
    });
    expect(oidc).not.toHaveBeenCalled();
  });

  it('resolves request-context Vercel OIDC with the governed project/team when the direct key is absent', async () => {
    const oidc = vi.fn(async () => 'vercel-oidc-token-12345678901234567890');
    await expect(resolveProductionSeyeonProviderConfigAtRequestV1({}, oidc)).resolves.toEqual({
      apiKey: 'vercel-oidc-token-12345678901234567890',
      model: 'openai/gpt-5.6-sol',
      origin: 'https://ai-gateway.vercel.sh',
    });
    expect(oidc).toHaveBeenCalledWith({
      project: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.vercelProject,
      team: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.vercelTeam,
    });
  });

  it('accepts only a server-owned gateway model override', async () => {
    const oidc = vi.fn(async () => 'vercel-oidc-token-12345678901234567890');
    await expect(resolveProductionSeyeonProviderConfigAtRequestV1({
      MYEONGHA_SEYEON_AI_GATEWAY_MODEL: 'openai/gpt-5.6-sol',
    }, oidc)).resolves.toEqual({
      apiKey: 'vercel-oidc-token-12345678901234567890',
      model: 'openai/gpt-5.6-sol',
      origin: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayOrigin,
    });
  });

  it('fails closed through existing provider validation when request-context OIDC cannot be resolved', async () => {
    const oidc = vi.fn(async () => {
      throw new Error('OIDC unavailable');
    });
    await expect(resolveProductionSeyeonProviderConfigAtRequestV1({}, oidc)).resolves.toEqual({
      apiKey: '',
      model: 'gpt-5.6-terra',
    });
  });
  it('leaves all role models unchanged unless server-owned overrides are set', () => {
    const base = { apiKey: 'sk-test-direct-key-1234567890', model: 'gpt-5.6-terra' };
    expect(resolveProductionSeyeonRoleProviderConfigsV1({}, base)).toBeUndefined();
    const roles = resolveProductionSeyeonRoleProviderConfigsV1({
      SEYEON_MODEL_PREFLIGHT: 'gpt-5.6-luna',
      SEYEON_MODEL_REVIEWER: 'gpt-5.6-luna',
    }, base);
    expect(roles?.preflight).toEqual({ ...base, model: 'gpt-5.6-luna' });
    expect(roles?.reviewer).toEqual({ ...base, model: 'gpt-5.6-luna' });
    expect(roles?.renderer).toBeUndefined();
    expect(roles?.interpreter).toBeUndefined();
    expect(base.model).toBe('gpt-5.6-terra');
  });

  it('keeps direct and gateway provider identities isolated during role overrides', async () => {
    const token = 'oidc-token-for-test-only-123456789';
    const gateway = await resolveProductionSeyeonProviderConfigAtRequestV1(
      { MYEONGHA_SEYEON_AI_GATEWAY_MODEL: 'openai/gpt-5.6-sol' },
      async () => token,
    );
    const roles = resolveProductionSeyeonRoleProviderConfigsV1(
      { SEYEON_MODEL_RENDERER: 'openai/gpt-5.6-terra' },
      gateway,
    );
    expect(roles?.renderer).toEqual({
      apiKey: token,
      origin: 'https://ai-gateway.vercel.sh',
      model: 'openai/gpt-5.6-terra',
    });
    expect(gateway.model).toBe('openai/gpt-5.6-sol');
  });

});
