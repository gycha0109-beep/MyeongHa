import { describe, expect, it } from 'vitest';

import {
  resolveProductionSeyeonProviderConfigV1,
  SEYEON_PRODUCTION_PROVIDER_ROUTING_V1,
} from '../apps/api/src/production-seyeon-turn-send-runtime-v1.js';

describe('Production Seyeon provider routing', () => {
  it('prefers an explicit direct OpenAI key and preserves the direct model contract', () => {
    expect(resolveProductionSeyeonProviderConfigV1({
      OPENAI_API_KEY: 'sk-test-direct-key-1234567890',
      VERCEL_OIDC_TOKEN: 'oidc-token-that-must-not-win-1234567890',
      MYEONGHA_SEYEON_OPENAI_MODEL: 'gpt-5.6-terra',
    })).toEqual({
      apiKey: 'sk-test-direct-key-1234567890',
      model: 'gpt-5.6-terra',
    });
  });

  it('uses the Vercel OIDC-backed AI Gateway only when the direct key is absent', () => {
    expect(resolveProductionSeyeonProviderConfigV1({
      VERCEL_OIDC_TOKEN: 'vercel-oidc-token-12345678901234567890',
    })).toEqual({
      apiKey: 'vercel-oidc-token-12345678901234567890',
      model: 'openai/gpt-5.6-sol',
      origin: 'https://ai-gateway.vercel.sh',
    });
  });

  it('accepts a server-owned gateway model override without browser authority', () => {
    expect(resolveProductionSeyeonProviderConfigV1({
      OPENAI_API_KEY: '   ',
      VERCEL_OIDC_TOKEN: 'vercel-oidc-token-12345678901234567890',
      MYEONGHA_SEYEON_AI_GATEWAY_MODEL: 'openai/gpt-5.6-sol',
    })).toEqual({
      apiKey: 'vercel-oidc-token-12345678901234567890',
      model: 'openai/gpt-5.6-sol',
      origin: SEYEON_PRODUCTION_PROVIDER_ROUTING_V1.gatewayOrigin,
    });
  });

  it('fails closed through the existing provider validation when neither server credential exists', () => {
    expect(resolveProductionSeyeonProviderConfigV1({})).toEqual({
      apiKey: '',
      model: 'gpt-5.6-terra',
    });
  });
});
