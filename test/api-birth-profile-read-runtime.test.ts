import { beforeAll, describe, expect, it } from 'vitest';
import birthProfileEndpoint, {
  createBirthProfilesVercelHandlerV1,
} from '../api/birth-profiles.js';

const PROFILE_ID = 'b6300000-0000-0000-0000-000000000001';
const OTHER_PROFILE_ID = 'b6300000-0000-0000-0000-000000000002';
const INTERNAL_ROUTE_PARAM = '__myeongha_birth_profile_id';
const VERCEL_DYNAMIC_ROUTE_PARAM = 'id';
const VERCEL_SHARE_PARAM = '_vercel_share';
const TEST_SHARE_TOKEN = 'test-vercel-share-token';

type Endpoint = typeof birthProfileEndpoint;
type EndpointRequest = Parameters<Endpoint>[0];

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
  process.env.MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

async function invokeEndpoint(
  request: EndpointRequest,
  endpoint: Endpoint = birthProfileEndpoint,
): Promise<CapturedResponse> {
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

  await endpoint(request, response);

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

function observedDynamicMetadataUrl(profileId: string): string {
  const search = new URLSearchParams({
    [INTERNAL_ROUTE_PARAM]: profileId,
    [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN,
    [VERCEL_DYNAMIC_ROUTE_PARAM]: profileId,
  });
  return `/api/birth-profiles/${profileId}?${search.toString()}`;
}

function validCreateBody(): object {
  return {
    label: '나의 명식록',
    input: {
      calendarType: 'solar',
      birthDate: '1990-01-02',
      birthTime: '08:30:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    },
  };
}

describe('GET /api/birth-profiles/:id production Vercel Node adapter', () => {
  it('accepts the production-observed Vercel dynamic route metadata shape', async () => {
    const response = await invokeEndpoint({
      method: 'GET',
      headers: {},
      query: {
        [INTERNAL_ROUTE_PARAM]: PROFILE_ID,
        [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN,
        [VERCEL_DYNAMIC_ROUTE_PARAM]: PROFILE_ID,
      },
      url: observedDynamicMetadataUrl(PROFILE_ID),
    });

    await expectAuthRequired(response);
  });

  it('accepts protected static-dispatcher metadata without the dynamic id helper', async () => {
    const search = new URLSearchParams({
      [INTERNAL_ROUTE_PARAM]: PROFILE_ID,
      [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN,
    });
    const response = await invokeEndpoint({
      method: 'GET',
      headers: {},
      query: {
        [INTERNAL_ROUTE_PARAM]: PROFILE_ID,
        [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN,
      },
      url: `/api/birth-profiles?${search.toString()}`,
    });

    await expectAuthRequired(response);
  });

  it('still accepts the minimal explicit private locator shape', async () => {
    const response = await invokeEndpoint({
      method: 'GET',
      headers: {},
      query: { [INTERNAL_ROUTE_PARAM]: PROFILE_ID },
      url: `/api/birth-profiles?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}`,
    });

    await expectAuthRequired(response);
  });

  it('preserves incoming authorization evidence when bridging to the Web runtime', async () => {
    const response = await invokeEndpoint({
      method: 'GET',
      headers: { authorization: 'Bearer invalid-test-evidence' },
      query: {
        [INTERNAL_ROUTE_PARAM]: PROFILE_ID,
        [VERCEL_DYNAMIC_ROUTE_PARAM]: PROFILE_ID,
      },
      url: `/api/birth-profiles/${PROFILE_ID}?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}&${VERCEL_DYNAMIC_ROUTE_PARAM}=${PROFILE_ID}`,
    });

    expect(response.status).toBe(401);
    expect(header(response, 'cache-control')).toBe('no-store');
  });

  it('fails closed for unknown, duplicate, array-valued, missing, or conflicting route metadata', async () => {
    const cases: EndpointRequest[] = [
      { method: 'GET', headers: {} },
      { method: 'GET', headers: {}, query: {} },
      {
        method: 'GET',
        headers: {},
        query: { [INTERNAL_ROUTE_PARAM]: [PROFILE_ID, PROFILE_ID] },
      },
      {
        method: 'GET',
        headers: {},
        query: { [INTERNAL_ROUTE_PARAM]: PROFILE_ID, debug: '1' },
      },
      {
        method: 'GET',
        headers: {},
        query: { [INTERNAL_ROUTE_PARAM]: PROFILE_ID, [VERCEL_DYNAMIC_ROUTE_PARAM]: OTHER_PROFILE_ID },
      },
      {
        method: 'GET',
        headers: {},
        query: { [INTERNAL_ROUTE_PARAM]: PROFILE_ID, [VERCEL_SHARE_PARAM]: [TEST_SHARE_TOKEN] },
      },
      {
        method: 'GET',
        headers: {},
        query: { [VERCEL_DYNAMIC_ROUTE_PARAM]: PROFILE_ID },
      },
      {
        method: 'GET',
        headers: {},
        url: `/api/birth-profiles/${OTHER_PROFILE_ID}?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}&${VERCEL_DYNAMIC_ROUTE_PARAM}=${PROFILE_ID}`,
      },
      {
        method: 'GET',
        headers: {},
        url: `/api/birth-profiles?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}&${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}`,
      },
      {
        method: 'GET',
        headers: {},
        url: `/api/birth-profiles/${PROFILE_ID}?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}&${VERCEL_DYNAMIC_ROUTE_PARAM}=${OTHER_PROFILE_ID}`,
      },
      {
        method: 'GET',
        headers: {},
        url: `/api/birth-profiles/${PROFILE_ID}?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}&debug=1`,
      },
    ];

    for (const request of cases) {
      const response = await invokeEndpoint(request);
      expect(response.status).toBe(404);
      expect(header(response, 'cache-control')).toBe('no-store');
      expect(response.body).toBe('');
    }
  });

  it('preserves the GET-only method boundary with observed Vercel metadata', async () => {
    const response = await invokeEndpoint({
      method: 'POST',
      headers: {},
      query: {
        [INTERNAL_ROUTE_PARAM]: PROFILE_ID,
        [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN,
        [VERCEL_DYNAMIC_ROUTE_PARAM]: PROFILE_ID,
      },
      url: observedDynamicMetadataUrl(PROFILE_ID),
    });

    expect(response.status).toBe(405);
    expect(header(response, 'allow')).toBe('GET');
    expect(header(response, 'cache-control')).toBe('no-store');
  });
});

describe('POST /api/birth-profiles production Vercel Node adapter', () => {
  it('activates the canonical root POST boundary without opening PostgreSQL for an unauthenticated request', async () => {
    const response = await invokeEndpoint({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      query: {},
      url: '/api/birth-profiles',
      body: validCreateBody(),
    });

    await expectAuthRequired(response);
  });

  it('accepts only benign Vercel share metadata on the canonical POST route', async () => {
    const response = await invokeEndpoint({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      query: { [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN },
      url: `/api/birth-profiles?${VERCEL_SHARE_PARAM}=${TEST_SHARE_TOKEN}`,
      body: validCreateBody(),
    });

    await expectAuthRequired(response);
  });

  it('canonicalizes parsed Vercel JSON body and authorization evidence without constructing the read runtime', async () => {
    let readRuntimeFactoryCalls = 0;
    let createRuntimeFactoryCalls = 0;
    const capturedRequests: Request[] = [];

    const endpoint: Endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime() {
        readRuntimeFactoryCalls += 1;
        return {
          async handleRequest() {
            return new Response(null, { status: 599 });
          },
        };
      },
      getCreateRuntime() {
        createRuntimeFactoryCalls += 1;
        return {
          async handleRequest(input) {
            capturedRequests.push(input.request);
            return Response.json(
              { ok: true },
              {
                status: 201,
                headers: { 'Cache-Control': 'no-store' },
              },
            );
          },
        };
      },
    });

    const requestBody = validCreateBody();
    const response = await invokeEndpoint(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer opaque-test-evidence',
          'content-type': 'application/json',
          'content-length': '9999',
          'x-request-context': 'birth-create-test',
        },
        query: { [VERCEL_SHARE_PARAM]: TEST_SHARE_TOKEN },
        url: `/api/birth-profiles?${VERCEL_SHARE_PARAM}=${TEST_SHARE_TOKEN}`,
        body: requestBody,
      },
      endpoint,
    );

    expect(response.status).toBe(201);
    expect(header(response, 'cache-control')).toBe('no-store');
    expect(readRuntimeFactoryCalls).toBe(0);
    expect(createRuntimeFactoryCalls).toBe(1);

    const canonicalRequest = capturedRequests[0];
    if (canonicalRequest === undefined) {
      throw new Error('Create runtime did not receive the canonical Vercel request.');
    }

    expect(canonicalRequest.method).toBe('POST');
    expect(canonicalRequest.url).toBe('https://myeongha.internal/api/birth-profiles');
    expect(canonicalRequest.headers.get('authorization')).toBe(
      'Bearer opaque-test-evidence',
    );
    expect(canonicalRequest.headers.get('content-type')).toBe('application/json');
    expect(canonicalRequest.headers.get('content-length')).toBeNull();
    expect(canonicalRequest.headers.get('transfer-encoding')).toBeNull();
    expect(canonicalRequest.headers.get('x-request-context')).toBe(
      'birth-create-test',
    );
    expect(await canonicalRequest.json()).toEqual(requestBody);
  });

  it('keeps the create-only HMAC runtime isolated from dynamic Birth reads', async () => {
    let readRuntimeFactoryCalls = 0;
    let createRuntimeFactoryCalls = 0;
    const capturedReadRequests: Request[] = [];

    const endpoint: Endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime() {
        readRuntimeFactoryCalls += 1;
        return {
          async handleRequest(input) {
            capturedReadRequests.push(input.request);
            return new Response(null, {
              status: 401,
              headers: { 'Cache-Control': 'no-store' },
            });
          },
        };
      },
      getCreateRuntime() {
        createRuntimeFactoryCalls += 1;
        throw new Error('Create runtime must stay lazy during Birth reads.');
      },
    });

    const response = await invokeEndpoint(
      {
        method: 'GET',
        headers: { authorization: 'Bearer read-test-evidence' },
        query: { [INTERNAL_ROUTE_PARAM]: PROFILE_ID },
        url: `/api/birth-profiles?${INTERNAL_ROUTE_PARAM}=${PROFILE_ID}`,
      },
      endpoint,
    );

    expect(response.status).toBe(401);
    expect(readRuntimeFactoryCalls).toBe(1);
    expect(createRuntimeFactoryCalls).toBe(0);

    const canonicalRequest = capturedReadRequests[0];
    if (canonicalRequest === undefined) {
      throw new Error('Read runtime did not receive the canonical Vercel request.');
    }
    expect(canonicalRequest.url).toBe(
      `https://myeongha.internal/api/birth-profiles/${PROFILE_ID}`,
    );
  });

  it('fails closed instead of creating when POST route metadata is unknown or malformed', async () => {
    let readRuntimeFactoryCalls = 0;
    let createRuntimeFactoryCalls = 0;
    const endpoint: Endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime() {
        readRuntimeFactoryCalls += 1;
        return {
          async handleRequest() {
            return new Response(null, { status: 599 });
          },
        };
      },
      getCreateRuntime() {
        createRuntimeFactoryCalls += 1;
        return {
          async handleRequest() {
            return new Response(null, { status: 598 });
          },
        };
      },
    });

    const cases: EndpointRequest[] = [
      {
        method: 'POST',
        headers: {},
        query: { debug: '1' },
        url: '/api/birth-profiles?debug=1',
        body: validCreateBody(),
      },
      {
        method: 'POST',
        headers: {},
        query: { [VERCEL_SHARE_PARAM]: [TEST_SHARE_TOKEN] },
        url: '/api/birth-profiles',
        body: validCreateBody(),
      },
      {
        method: 'POST',
        headers: {},
        query: {},
        url: `/api/birth-profiles/${PROFILE_ID}`,
        body: validCreateBody(),
      },
      {
        method: 'POST',
        headers: {},
        query: {},
        url: '/api/birth-profiles#fragment',
        body: validCreateBody(),
      },
    ];

    for (const request of cases) {
      const response = await invokeEndpoint(request, endpoint);
      expect(response.status).toBe(404);
      expect(header(response, 'cache-control')).toBe('no-store');
      expect(response.body).toBe('');
    }

    expect(readRuntimeFactoryCalls).toBe(0);
    expect(createRuntimeFactoryCalls).toBe(0);
  });
});
