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
  it('bounds oversized and stalled provider bodies', async () => {
    expect(await readSeyeonProviderFailureDiagnosticV1(new Response('x'.repeat(16_385)))).toEqual({ reason: 'UNKNOWN', errorCode: null, errorType: null });
    const result = await readSeyeonProviderFailureDiagnosticV1(new Response(new ReadableStream({ start() {} })));
    expect(result.reason).toBe('UNKNOWN');
  });
});
