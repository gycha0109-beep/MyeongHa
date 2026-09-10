import { beforeAll, describe, expect, it } from 'vitest';
import meEndpoint, { toCanonicalMeRequestForTestV1 } from '../api/me.js';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_api_me_body_stream_forwarding';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

function streamRequest(stream: ReadableStream<Uint8Array>): Request {
  return new Request('https://myeongha.example/api/chat?__myeongha_chat_open=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('/api/me dispatcher body stream forwarding', () => {
  it('returns Chat-open AUTH_REQUIRED without consuming or draining a non-closing body', async () => {
    const incoming = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"characterId":'));
      },
    });
    const request = streamRequest(incoming);

    const response = await meEndpoint.fetch(request);

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
      },
      meta: { apiContractVersion: 'v0.9' },
    });
    expect(request.bodyUsed).toBe(false);
    await request.body?.cancel();
  });

  it('preserves exact body bytes when the downstream consumer chooses to read them', async () => {
    const payload = new TextEncoder().encode('{"characterId":"캐릭터-A"}\n');
    const request = new Request(
      'https://myeongha.example/api/chat?__myeongha_chat_open=1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: payload,
      },
    );

    const canonical = toCanonicalMeRequestForTestV1(request);

    expect(canonical.url).toBe('https://myeongha.internal/api/chat');
    expect(canonical.method).toBe('POST');
    expect(canonical.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(request.bodyUsed).toBe(false);
    expect(new Uint8Array(await canonical.arrayBuffer())).toEqual(payload);
  });

  it('keeps a bodyless Chat-open request bodyless', () => {
    const request = new Request(
      'https://myeongha.example/api/chat?__myeongha_chat_open=1',
      { method: 'POST' },
    );

    const canonical = toCanonicalMeRequestForTestV1(request);

    expect(canonical.url).toBe('https://myeongha.internal/api/chat');
    expect(canonical.body).toBeNull();
  });
});
