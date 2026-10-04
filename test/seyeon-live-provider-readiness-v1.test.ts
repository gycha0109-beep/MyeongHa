import { describe, expect, it, vi } from 'vitest';

import {
  OpenAiSeyeonStructuredProviderErrorV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  runSeyeonLiveProviderReadinessV1,
} from '../apps/api/src/seyeon-live-provider-readiness-v1.js';

describe('Se-yeon live provider readiness V1', () => {
  it('performs exactly one non-stored strict-schema provider request and returns safe identity only', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      expect(body.store).toBe(false);
      expect(body.model).toBe('gpt-test');
      expect(body.text.format).toMatchObject({
        type: 'json_schema',
        name: 'myeongha_semantic_review_v2',
        strict: true,
      });
      expect(body.text.format.schema).toEqual({
        type: 'object',
        additionalProperties: false,
        required: ['ready'],
        properties: {
          ready: {
            type: 'boolean',
            const: true,
          },
        },
      });
      expect(body.input[0].content[0].text).toBe(
        JSON.stringify({
          probe: 'seyeon-live-provider-readiness-v1',
          requiresConversation: false,
          requiresDatabaseWrite: false,
        }),
      );

      return new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: JSON.stringify({ ready: true }),
          }],
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await runSeyeonLiveProviderReadinessV1({
      apiKey: 'test-api-key-1234567890',
      model: 'gpt-test',
      fetchImpl,
    });

    expect(result).toEqual({
      version: 'seyeon-live-provider-readiness-v1',
      verdict: 'PASS',
      providerKey: 'openai-responses',
      modelKey: 'gpt-test',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(
      'test-api-key-1234567890',
    );
  });

  it('fails closed on invalid readiness payload without retry', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'output_text',
            text: JSON.stringify({ ready: false }),
          }],
        }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      runSeyeonLiveProviderReadinessV1({
        apiKey: 'test-api-key-1234567890',
        model: 'gpt-test',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(
      OpenAiSeyeonStructuredProviderErrorV1,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
