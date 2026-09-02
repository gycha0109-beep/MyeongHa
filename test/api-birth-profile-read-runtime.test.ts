import { beforeAll, describe, expect, it } from 'vitest';
import birthProfileEndpoint from '../api/birth-profiles.js';

const PROFILE_ID = 'b6300000-0000-0000-0000-000000000001';

type EndpointRequest = Parameters<typeof birthProfileEndpoint>[0];

type CapturedResponse = {
  status: number;
  headers: Map<string, string>;
  body: string;
};

beforeAll(() => {
  process.env.MYEONGHA_DATABASE_URL =
    'postgresql://myeongha_runtime.cnsfpcdiyofqvhpcegfc:test-password@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require';
  process.env.MYEONGHA_DATABASE_PRINCIPAL = 'myeongha_runtime';
  process.env.MYEONGHA_SUPABASE_URL = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
  process.env.MYEONGHA_SUPABASE_API_KEY =
    'sb_publishable_test_key_material_for_birth_profile_runtime';
  process.env.MYEONGHA_GUEST_FINGERPRINT_SECRET =
    'test-guest-fingerprint-secret-material-at-least-thirty-two-bytes';
});

async function invokeEndpoint(request: EndpointRequest): Promise<CapturedResponse> {
  const headers = new Map<string, string>();
  let body = '';

  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk?: Uint8Array) {
      if (chunk !== undefined) body = new TextDecoder().decode(chunk);
    },
  };

  await birthProfileEndpoint(request, response);

  return {
    status: response.statusCode,
    headers,
    body,
  };
}

function header(response: CapturedResponse, name: string): string | undefined {
  return response.headers.get(name.toLowerCase());
}

async function expectAuthRequired(response: CapturedResponse): Promise<void> {
  expect(response.status).toBe(401);
  expect(header(response, 'cache-control')).toBe('no-store');
  expect(header(response, 'content-type')).toContain('application/json');

  const body = JSON.parse(response.body) as {
    ok: boolean;
    error: {
      code: string;
      messageKey: string;
      retryable: boolean;
    };
    meta: {
      apiContractVersion: string;
      requestId: string;
    };
  };

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
}

describe('GET /api/birth-profiles/:id production Vercel Node adapter', () => {
  it('uses the Vercel query metadata id and reaches governed AUTH_REQUIRED', async () => {
    const response = await invokeEndpoint({
      method: 'GET',
      headers: {},
      query: { id: PROFILE_ID },
    });

    await expectAuthRequired(response);
  });

  it('preserves incoming authorization evidence when bridging to the Web runtime', async () => {
    const response = await invokeEndpoint({
      method: 'GET',
      headers: { authorization: 'Bearer invalid-test-evidence' },
      query: { id: PROFILE_ID },
    });

    expect(response.status).toBe(401);
    expect(header(response, 'cache-control')).toBe('no-store');
  });

  it('fails closed when route metadata is missing, duplicated, array-valued, or polluted', async () => {
    const cases: EndpointRequest[] = [
      { method: 'GET', headers: {}, query: undefined },
      { method: 'GET', headers: {}, query: {} },
      { method: 'GET', headers: {}, query: { id: [PROFILE_ID, PROFILE_ID] } },
      { method: 'GET', headers: {}, query: { id: PROFILE_ID, debug: '1' } },
      { method: 'GET', headers: {}, query: { id: '' } },
      { method: 'GET', headers: {}, query: { id: `${PROFILE_ID}/extra` } },
    ];

    for (const request of cases) {
      const response = await invokeEndpoint(request);
      expect(response.status).toBe(404);
      expect(header(response, 'cache-control')).toBe('no-store');
      expect(response.body).toBe('');
    }
  });

  it('preserves the GET-only method boundary after Vercel Node dispatch', async () => {
    const response = await invokeEndpoint({
      method: 'POST',
      headers: {},
      query: { id: PROFILE_ID },
    });

    expect(response.status).toBe(405);
    expect(header(response, 'allow')).toBe('GET');
    expect(header(response, 'cache-control')).toBe('no-store');
  });
});
