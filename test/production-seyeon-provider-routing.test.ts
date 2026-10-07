import { describe, expect, it, vi } from 'vitest';

import {
  createOpenAiSeyeonStructuredProviderV1,
  OpenAiSeyeonStructuredProviderErrorV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  resolveProductionSeyeonProviderConfigAtRequestV1,
  SEYEON_PRODUCTION_PROVIDER_ROUTING_V1,
} from '../apps/api/src/production-seyeon-turn-send-runtime-v1.js';

describe('Production Seyeon provider routing', () => {
  it('admits the single provider/model scope required by Vercel AI Gateway', () => {
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'vercel-oidc-token-12345678901234567890',
      model: 'openai/gpt-5.6-sol',
      origin: 'https://ai-gateway.vercel.sh',
    })).not.toThrow();
  });

  it.each([
    '/gpt-5.6-sol',
    'openai/',
    'openai/models/gpt-5.6-sol',
  ])('rejects path-like or empty scoped model identifiers: %s', (model) => {
    try {
      createOpenAiSeyeonStructuredProviderV1({
        apiKey: 'vercel-oidc-token-12345678901234567890',
        model,
        origin: 'https://ai-gateway.vercel.sh',
      });
      throw new Error('expected invalid configuration');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAiSeyeonStructuredProviderErrorV1);
      expect((error as OpenAiSeyeonStructuredProviderErrorV1).code).toBe('INVALID_CONFIGURATION');
    }
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
});
