import { describe, expect, it } from 'vitest';
import { createOpenAiSeyeonStructuredProviderV1 } from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import { readFileSync } from 'node:fs';
import {
  resolveProductionSeyeonProviderConfigAtRequestV1,
  resolveProductionSeyeonRoleProviderConfigsV1,
  SEYEON_PRODUCTION_PROVIDER_ROUTING_V1,
} from '../apps/api/src/production-seyeon-turn-send-runtime-v1.js';

describe('Production Seyeon provider routing', () => {
  it('routes the default spoken reply through OpenRouter GLM instead of a native OpenAI renderer', () => {
    expect(SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.responseModel).toBe('z-ai/glm-5.3-flash');
    const send = readFileSync(new URL('../apps/api/src/production-seyeon-turn-send-runtime-v1.ts', import.meta.url), 'utf8');
    const runtime = readFileSync(new URL('../apps/api/src/production-seyeon-chat-runtime-v1.ts', import.meta.url), 'utf8');
    expect(send).toContain("glmRendererConfig: { apiKey: optionalEnv(input.env, 'OPENROUTER_API_KEY') ?? '' }");
    expect(runtime).toContain('createSeyeonGlmRendererV1({');
    expect(runtime).toContain("if (role === 'renderer' && input.glmRendererConfig !== undefined)");
  });

  it('uses the server-owned direct OpenAI key and model', async () => {
    await expect(resolveProductionSeyeonProviderConfigAtRequestV1({
      OPENAI_API_KEY: 'sk-test-direct-key-1234567890',
      MYEONGHA_SEYEON_OPENAI_MODEL: 'gpt-5.6-terra',
    })).resolves.toEqual({
      apiKey: 'sk-test-direct-key-1234567890',
      model: 'gpt-5.6-terra',
    });
  });

  it('fails closed without the direct OpenAI key', async () => {
    await expect(resolveProductionSeyeonProviderConfigAtRequestV1({})).resolves.toEqual({
      apiKey: '',
      model: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.directDefaultModel,
    });
  });

  it('does not activate the retired gateway from unrelated environment variables', async () => {
    const config = await resolveProductionSeyeonProviderConfigAtRequestV1({
      MYEONGHA_SEYEON_AI_GATEWAY_MODEL: 'openai/gpt-5.6-sol',
      VERCEL_OIDC_TOKEN: 'disabled-token',
    });
    expect(config).toEqual({ apiKey: '', model: 'gpt-5.6-terra' });
    expect(config).not.toHaveProperty('origin');
  });

  it('rejects malformed direct OpenAI model names through existing provider validation', () => {
    const config = { apiKey: 'sk-test-direct-key-1234567890', model: 'gpt-5.6-terra' };
    expect(createOpenAiSeyeonStructuredProviderV1(config).modelKey).toBe('gpt-5.6-terra');
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      ...config, model: 'openai//gpt-5.6-sol',
    })).toThrow('OpenAI model identifier is invalid.');
  });

  it('leaves role models unchanged unless server-owned overrides are set', () => {
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
  });

  it('uses direct provider credentials for role-specific model overrides', async () => {
    const base = await resolveProductionSeyeonProviderConfigAtRequestV1({
      OPENAI_API_KEY: 'sk-test-direct-key-1234567890',
    });
    const roles = resolveProductionSeyeonRoleProviderConfigsV1({
      SEYEON_MODEL_RENDERER: 'gpt-5.6-terra',
    }, base);
    expect(roles?.renderer).toEqual({
      apiKey: 'sk-test-direct-key-1234567890',
      model: 'gpt-5.6-terra',
    });
    expect(roles?.renderer).not.toHaveProperty('origin');
  });
});
