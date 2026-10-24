import { readFileSync } from 'node:fs';
import { createOpenAiSeyeonStructuredProviderV1 } from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import { describe, expect, it } from 'vitest';
import {
  buildSeyeonExternalEgressEvidenceV1,
  SEYEON_EXTERNAL_EGRESS_EVIDENCE_V1,
} from '../apps/api/src/seyeon-external-egress-evidence-v1.js';

describe('L3-A OpenAI/Vercel AI Gateway outbound data-class evidence', () => {
  it('rejects unreviewed outbound hosts before any AI request can be sent', () => {
    const config = {
      apiKey: 'synthetic-key-with-no-user-private-data-12345',
      model: 'gpt-5.6-terra',
    };
    expect(() => createOpenAiSeyeonStructuredProviderV1(config)).not.toThrow();
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      ...config, model: 'openai/gpt-5.6-sol', origin: 'https://ai-gateway.vercel.sh',
    })).not.toThrow();
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      ...config, model: 'anthropic/claude-other-model', origin: 'https://ai-gateway.vercel.sh',
    })).toThrow('AI Gateway model must use the approved OpenAI namespace.');
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      ...config, model: 'openai/gpt-5.6-sol',
    })).toThrow('OpenAI Direct model must use an unscoped identifier.');
    for (const origin of [
      'https://unreviewed.example',
      'https://api.openai.com.evil.example',
      'https://127.0.0.1',
      'https://ai-gateway.vercel.sh.evil.example',
    ]) {
      expect(() => createOpenAiSeyeonStructuredProviderV1({
        ...config, origin,
      })).toThrow('OpenAI origin is not an audited provider destination.');
    }
  });

  it('only records a fixed set of safe categories and coarse volume buckets', () => {
    const secrets = {
      message: '실명 홍길동, 전화번호 010-1234-5678, 건강 관련 비밀',
      memory: '2026-10-25 private diary; CI_DI_IDENTIFYING_SECRET',
      subject: '22222222-2222-4222-8222-222222222222',
    };
    const event = buildSeyeonExternalEgressEvidenceV1({
      purpose: 'turn_interpretation',
      destination: 'openai_direct',
      providerInput: {
        context: {
          recentConversation: [secrets.message, secrets.message],
          retrievedMemories: [secrets.memory],
          subjectId: secrets.subject,
          sensitiveExtra: secrets,
        },
      },
    });
    expect(event).toEqual({
      schemaVersion: 'myeongha-seyeon-egress-evidence-v1',
      stage: 'turn_interpretation', destinationClass: 'openai_direct',
      storeFalseRequested: true, contentLogged: false, privateDataPossible: true,
      conversationCountBucket: '1-5', memoryCountBucket: '1-5',
      hasRendererPacket: false, hasGeneratedDraft: false,
    });
    const serialized = JSON.stringify(event);
    for (const privateValue of Object.values(secrets)) {
      if (typeof privateValue === 'string') expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).not.toMatch(/홍길동|010-1234|private diary|CI_DI_|subjectId|sensitiveExtra/u);
    expect(SEYEON_EXTERNAL_EGRESS_EVIDENCE_V1).toMatchObject({
      payloadLogged: false, includesIdentifyingValues: false,
    });
  });

  it('identifies renderer and semantic review without opening private packets', () => {
    const packet = {
      privateSourceRef: 'private:999',
      excerpt: 'someone else\'s secret',
    };
    const render = buildSeyeonExternalEgressEvidenceV1({
      purpose: 'dialogue_render', destination: 'vercel_ai_gateway',
      providerInput: { packet },
    });
    expect(render).toMatchObject({
      stage: 'dialogue_render', hasRendererPacket: true,
      hasGeneratedDraft: false, conversationCountBucket: 'unknown',
      memoryCountBucket: 'unknown',
    });
    const review = buildSeyeonExternalEgressEvidenceV1({
      purpose: 'semantic_review', destination: 'openai_direct',
      providerInput: { packet, rendererDraft: 'user private reply' },
    });
    expect(review).toMatchObject({
      stage: 'semantic_review', hasRendererPacket: true,
      hasGeneratedDraft: true,
    });
    expect(JSON.stringify([render, review])).not.toMatch(/private:999|someone else|private reply/u);
  });

  it('is invoked only on the real provider dispatch path and never sends content to logger', () => {
    const source = readFileSync(new URL(
      '../apps/api/src/openai-seyeon-structured-provider-v1.ts', import.meta.url,
    ), 'utf8');
    const metric = source.indexOf('MYEONGHA_SEYEON_EGRESS_EVIDENCE');
    const dispatch = source.indexOf('await awaitBoundedUpstreamJsonResponseHeadersV1(fetchImpl(endpoint');
    expect(metric).toBeGreaterThan(0);
    expect(dispatch).toBeGreaterThan(metric);
    expect(source).toContain('providerInput: request.input');
    expect(source).toContain('JSON.stringify(egressEvidence)');
    expect(source).toContain('store: false');
    expect(source).not.toContain('JSON.stringify(request.input));\n        response = await');
  });
});
