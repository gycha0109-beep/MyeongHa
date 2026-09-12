import { describe, expect, it } from 'vitest';
import { createBirthProfilesVercelHandlerV1 } from '../api/birth-profiles.js';

type Endpoint = ReturnType<typeof createBirthProfilesVercelHandlerV1>;
type EndpointRequest = Parameters<Endpoint>[0];

type CapturedResponse = {
  status: number;
  headers: Map<string, string>;
  body: string;
};

async function invokeEndpoint(
  endpoint: Endpoint,
  request: EndpointRequest,
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
  return { status: response.statusCode, headers, body };
}

function failIfReadRuntimeConstructed(): never {
  throw new Error('Birth read runtime must not be constructed for root create requests.');
}

describe('POST /api/birth-profiles lazy parsed-body serialization', () => {
  it('returns an unauthenticated runtime response without traversing the parsed body', async () => {
    let serializationCalls = 0;
    let canonicalBodyUsed: boolean | undefined;
    const parsedBody = {
      toJSON() {
        serializationCalls += 1;
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
      },
    };

    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime: failIfReadRuntimeConstructed,
      getCreateRuntime() {
        return {
          async handleRequest(input) {
            canonicalBodyUsed = input.request.bodyUsed;
            return Response.json(
              {
                ok: false,
                error: {
                  code: 'AUTH_REQUIRED',
                  messageKey: 'auth.required',
                  retryable: false,
                },
                meta: { apiContractVersion: 'v0.9' },
              },
              {
                status: 401,
                headers: { 'Cache-Control': 'no-store' },
              },
            );
          },
        };
      },
    });

    const response = await invokeEndpoint(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '9999',
      },
      query: {},
      url: '/api/birth-profiles',
      body: parsedBody,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(canonicalBodyUsed).toBe(false);
    expect(serializationCalls).toBe(0);
  });

  it('serializes exactly when the downstream runtime consumes the canonical body', async () => {
    let serializationCalls = 0;
    let consumedBody: unknown;
    let canonicalContentLength: string | null | undefined;
    let canonicalTransferEncoding: string | null | undefined;
    const expectedBody = {
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
    const parsedBody = {
      toJSON() {
        serializationCalls += 1;
        return expectedBody;
      },
    };

    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime: failIfReadRuntimeConstructed,
      getCreateRuntime() {
        return {
          async handleRequest(input) {
            expect(input.request.bodyUsed).toBe(false);
            canonicalContentLength = input.request.headers.get('content-length');
            canonicalTransferEncoding = input.request.headers.get('transfer-encoding');
            consumedBody = await input.request.json();
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

    const response = await invokeEndpoint(endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer opaque-test-evidence',
        'content-type': 'application/json',
        'content-length': '9999',
        'transfer-encoding': 'chunked',
      },
      query: {},
      url: '/api/birth-profiles',
      body: parsedBody,
    });

    expect(response.status).toBe(201);
    expect(serializationCalls).toBe(1);
    expect(consumedBody).toEqual(expectedBody);
    expect(canonicalContentLength).toBeNull();
    expect(canonicalTransferEncoding).toBeNull();
  });
});
