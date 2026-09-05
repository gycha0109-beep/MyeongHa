import { beforeAll, describe, expect, it } from 'vitest';
import meEndpoint from '../api/me.js';

const THREAD_ID = '93000000-0000-4000-8000-000000000001';

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_api_me_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

describe('GET /api/me production route adapter', () => {
  it('returns the governed AUTH_REQUIRED response without opening PostgreSQL when credentials are absent', async () => {
    const response = await meEndpoint.fetch(
      new Request('https://myeongha.example/api/me', { method: 'GET' }),
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
      },
      meta: {
        apiContractVersion: 'v0.9',
      },
    });
    expect(body.meta.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('preserves the source-safe GET-only method boundary at the executable route', async () => {
    const response = await meEndpoint.fetch(
      new Request('https://myeongha.example/api/me', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  it.each([
    ['life-record', '/api/life-record'],
    ['memories', '/api/memories'],
  ] as const)(
    'dispatches the private %s rewrite to the governed owner read boundary',
    async (dispatchValue, publicRoute) => {
      const response = await meEndpoint.fetch(
        new Request(
          `https://myeongha.example/api/me?__myeongha_records_read=${dispatchValue}`,
          { method: 'GET' },
        ),
      );

      expect(response.status, publicRoute).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        ok: false,
        error: {
          code: 'AUTH_REQUIRED',
          messageKey: 'auth.required',
          retryable: false,
        },
        meta: {
          apiContractVersion: 'v0.9',
        },
      });
    },
  );

  it('dispatches the private Chat thread locator while forwarding only the cursor', async () => {
    const response = await meEndpoint.fetch(
      new Request(
        `https://myeongha.example/api/me?__myeongha_chat_thread_id=${THREAD_ID}&afterSequenceNo=12`,
        { method: 'GET' },
      ),
    );

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
  });

  it.each(['subjectId', 'characterId', 'presentationKey', 'unexpected']) (
    'rejects forwarded client Chat authority/unknown query parameter %s',
    async (key) => {
      const response = await meEndpoint.fetch(
        new Request(
          `https://myeongha.example/api/me?__myeongha_chat_thread_id=${THREAD_ID}&${key}=attacker-value`,
          { method: 'GET' },
        ),
      );

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('');
    },
  );

  it.each([
    `https://myeongha.example/api/me?__myeongha_chat_thread_id=`,
    `https://myeongha.example/api/me?__myeongha_chat_thread_id=${THREAD_ID}&__myeongha_chat_thread_id=${THREAD_ID}`,
    `https://myeongha.example/api/me?afterSequenceNo=1`,
    `https://myeongha.example/api/me?__myeongha_chat_thread_id=${THREAD_ID}&afterSequenceNo=-1`,
    `https://myeongha.example/api/me?__myeongha_records_read=memories&__myeongha_chat_thread_id=${THREAD_ID}`,
  ])('fails closed for malformed or conflicting private Chat dispatcher input: %s', async (url) => {
    const response = await meEndpoint.fetch(new Request(url, { method: 'GET' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('rejects forwarded client query parameters instead of passing subject authority to Records', async () => {
    const response = await meEndpoint.fetch(
      new Request(
        'https://myeongha.example/api/me?__myeongha_records_read=memories&subjectId=ffffffff-ffff-4fff-8fff-ffffffffffff',
        { method: 'GET' },
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });
});
