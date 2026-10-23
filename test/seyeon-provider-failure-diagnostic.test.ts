import { describe, expect, it } from 'vitest';
import { readSeyeonProviderFailureDiagnosticV1 } from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

describe('provider failure diagnostic privacy', () => {
  it('classifies model credit restrictions without reflecting provider text', async () => {
    const result = await readSeyeonProviderFailureDiagnosticV1(Response.json({ error: {
      code: 'model_not_allowed', type: 'permission_error',
      message: 'This model is not available with free tier credits. secret-token private-message',
    } }, { status: 403 }));
    expect(result).toEqual({ reason: 'MODEL_FREE_TIER_RESTRICTED', errorCode: 'model_not_allowed', errorType: 'permission_error' });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
  it('never reflects unknown error fields or non-JSON proxy bodies', async () => {
    for (const response of [Response.json({ error: { code: 'sk-private', type: 'private-message', message: 'private text' } }), new Response('<html>sk-private</html>')]) {
      expect(await readSeyeonProviderFailureDiagnosticV1(response)).toEqual({ reason: 'UNKNOWN', errorCode: null, errorType: null });
    }
  });
  it('recognizes safe diagnostic codes across split UTF-8 stream chunks without Node Buffer', async () => {
    const json = JSON.stringify({ error: {
      code: 'model_not_allowed',
      type: 'permission_error',
      message: '한글 경고: free tier credits do not support this model. PRIVATE_SECRET',
    } });
    const bytes = new TextEncoder().encode(json);
    const utf8Lead = bytes.findIndex(byte => byte >= 0xe0);
    expect(utf8Lead).toBeGreaterThan(0);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, utf8Lead + 1));
        controller.enqueue(bytes.slice(utf8Lead + 1, utf8Lead + 2));
        controller.enqueue(bytes.slice(utf8Lead + 2));
        controller.close();
      },
    });
    const result = await readSeyeonProviderFailureDiagnosticV1(new Response(stream, { status: 403 }));
    expect(result).toEqual({
      reason: 'MODEL_FREE_TIER_RESTRICTED',
      errorCode: 'model_not_allowed',
      errorType: 'permission_error',
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SECRET');
  });

  it('bounds oversized and stalled provider bodies', async () => {
    expect(await readSeyeonProviderFailureDiagnosticV1(new Response('x'.repeat(16_385)))).toEqual({ reason: 'UNKNOWN', errorCode: null, errorType: null });
    const result = await readSeyeonProviderFailureDiagnosticV1(new Response(new ReadableStream({ start() {} })));
    expect(result.reason).toBe('UNKNOWN');
  });
});
