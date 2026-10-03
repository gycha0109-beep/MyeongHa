import { describe, expect, it, vi } from 'vitest';
import {
  buildSajuProductionReadingRequestV1,
  createSajuPreviewReadingHttpAdapterV1,
  createSajuProductionReadingHttpAdapterV1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
  SAJU_PREVIEW_READING_LIFECYCLE_V1,
  SAJU_READING_LIFECYCLE_HEADER_V1,
  SajuProductionReadingHttpAdapterErrorV1,
} from './saju-production-reading-http-adapter.js';
import { SAJU_READING_JSON_RESPONSE_MAXIMUM_BYTES_V1 } from './upstream-json-response-resource.js';

const encoder = new TextEncoder();

function textStream(value: string): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(value);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const BIRTH_REVISION = Object.freeze({
  birthRevisionRef: 'revision-1',
  calendarType: 'solar' as const,
  birthDate: '2000-01-02',
  birthTime: null,
  timeKnown: false,
  isLeapMonth: false,
  sex: 'male' as const,
});

function jsonResponse(
  status: number,
  body: unknown,
  admissionVersion: string | null =
    SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
  lifecycle: string | null = null,
): {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array>;
  text(): Promise<string>;
} {
  const serialized = JSON.stringify(body);
  return {
    status,
    headers: {
      get(name: string) {
        const normalized = name.toLowerCase();
        if (normalized === 'content-type') {
          return 'application/json; charset=utf-8';
        }
        if (normalized === SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1) {
          return admissionVersion;
        }
        if (normalized === SAJU_READING_LIFECYCLE_HEADER_V1) return lifecycle;
        return null;
      },
    },
    body: textStream(serialized),
    async text() {
      return serialized;
    },
  };
}

describe('Saju Product Reading HTTP adapter', () => {
  it('serializes the current Birth revision into the exact ProductHost request shape', () => {
    expect(
      buildSajuProductionReadingRequestV1({
        birthRevision: BIRTH_REVISION,
        readingText: '전체 사주',
      }),
    ).toEqual({
      birth: {
        calendarType: 'solar',
        date: '2000-01-02',
        time: null,
        sex: 'male',
      },
      reading: {
        text: '전체 사주',
      },
    });
  });

  it('preserves an explicit compatibility target reference', () => {
    expect(
      buildSajuProductionReadingRequestV1({
        birthRevision: BIRTH_REVISION,
        readingText: '궁합',
        targetPersonRef: 'target-person-1',
      }),
    ).toMatchObject({
      reading: {
        text: '궁합',
        targetPersonRef: 'target-person-1',
      },
    });
  });

  it('accepts a source-attested response without duplicating Saju response admission locally', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const payload = {
      responseVersion: 'myeonghwa-product-reading-response-v2',
      state: 'temporarily_unavailable',
    };
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse(200, payload);
    });

    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl,
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '직업운',
    });

    await expect(adapter.requestReading(request)).resolves.toEqual(payload);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://saju.example.test/api/readings');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.redirect).toBe('manual');
    expect(calls[0]?.init.headers.authorization).toBe('Bearer service-credential');
    expect(JSON.parse(calls[0]?.init.body)).toEqual(request);
  });

  it('uses the Preview endpoint and requires the exact Preview lifecycle attestation', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const payload = {
      responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
      state: 'delivered',
    };
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      calls.push({ url, init });
      return jsonResponse(
        200,
        payload,
        SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
        SAJU_PREVIEW_READING_LIFECYCLE_V1,
      );
    });
    const adapter = createSajuPreviewReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl,
    });
    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '전체 사주',
    });

    await expect(adapter.requestReading(request)).resolves.toEqual(payload);
    expect(calls[0]?.url).toBe('https://saju.example.test/api/preview/readings');

    const missingLifecycle = createSajuPreviewReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () => jsonResponse(200, payload),
    });
    await expect(missingLifecycle.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_LIFECYCLE_ATTESTATION_REJECTED',
      httpStatus: 200,
    });
  });

  it('rejects HTTP 200 when the source admission attestation is missing', async () => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () => jsonResponse(200, { state: 'delivered' }, null),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '전체 사주',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_ADMISSION_ATTESTATION_REJECTED',
      httpStatus: 200,
    });
  });

  it('rejects HTTP 200 when the source admission attestation version is not exact', async () => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () =>
        jsonResponse(200, { state: 'delivered' }, 'myeonghwa-product-reading-response-v1'),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '전체 사주',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_ADMISSION_ATTESTATION_REJECTED',
    });
  });

  it('rejects an attested response whose envelope version disagrees with the attestation', async () => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () =>
        jsonResponse(200, {
          responseVersion: 'myeonghwa-product-reading-response-v1',
          state: 'temporarily_unavailable',
        }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '전체 사주',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_ADMISSION_ATTESTATION_REJECTED',
    });
  });

  it('rejects an oversized attested response before JSON parsing', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(encoder.encode('{"responseVersion":"myeonghwa-product-reading-response-v2"}'));
        controller.close();
      },
      cancel() {
        cancelled += 1;
      },
    }, { highWaterMark: 0 });

    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () => ({
        status: 200,
        headers: {
          get(name: string) {
            const normalized = name.toLowerCase();
            if (normalized === 'content-type') return 'application/json';
            if (normalized === 'content-length') {
              return String(SAJU_READING_JSON_RESPONSE_MAXIMUM_BYTES_V1 + 1);
            }
            if (normalized === SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1) {
              return SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1;
            }
            return null;
          },
        },
        body,
        async text() {
          throw new Error('unbounded text() must not be called');
        },
      }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '재물운',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE',
      httpStatus: 200,
    });
    expect(cancelled).toBe(1);
    expect(body.locked).toBe(false);
  });

  it('rejects malformed JSON after verifying the source admission attestation', async () => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () => ({
        status: 200,
        headers: {
          get(name: string) {
            if (name.toLowerCase() === 'content-type') return 'application/json';
            if (name.toLowerCase() === SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1) {
              return SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1;
            }
            return null;
          },
        },
        body: textStream('{not-json'),
        async text() {
          return '{not-json';
        },
      }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '재물운',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'INVALID_JSON',
    });
  });

  it('keeps the deadline active while reading the attested response body', async () => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      timeoutMs: 1,
      fetchImpl: async () => ({
        status: 200,
        headers: {
          get(name: string) {
            if (name.toLowerCase() === 'content-type') return 'application/json';
            if (name.toLowerCase() === SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1) {
              return SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1;
            }
            return null;
          },
        },
        body: new ReadableStream<Uint8Array>({
          pull() {
            return new Promise<void>(() => undefined);
          },
        }, { highWaterMark: 0 }),
        text: () => new Promise<string>(() => undefined),
      }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '올해 운세',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('supports an optional local defense-in-depth admission without making it the source authority', async () => {
    const admit = vi.fn((input: unknown) => Object.freeze({ admitted: input }));
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      admissionPort: { admit },
      fetchImpl: async () =>
        jsonResponse(200, {
          responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
          state: 'delivered',
        }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '연애운',
    });

    await expect(adapter.requestReading(request)).resolves.toEqual({
      admitted: {
        responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
        state: 'delivered',
      },
    });
    expect(admit).toHaveBeenCalledTimes(1);
  });

  it('fails closed when configured defense-in-depth admission rejects the payload', async () => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      admissionPort: {
        admit() {
          throw new Error('not canonical');
        },
      },
      fetchImpl: async () =>
        jsonResponse(200, {
          responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
          state: 'delivered',
        }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '연애운',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code: 'RESPONSE_ADMISSION_REJECTED',
      httpStatus: 200,
    });
  });

  it.each([
    [409, 'HTTP_4XX'],
    [503, 'HTTP_5XX'],
    [302, 'HTTP_UNEXPECTED_STATUS'],
  ])('maps upstream status %s without treating it as semantic success', async (status, code) => {
    const adapter = createSajuProductionReadingHttpAdapterV1({
      baseUrl: 'https://saju.example.test',
      bearerToken: 'service-credential',
      fetchImpl: async () => jsonResponse(status, { privateDetail: 'not-consumed' }),
    });

    const request = buildSajuProductionReadingRequestV1({
      birthRevision: BIRTH_REVISION,
      readingText: '사업운',
    });

    await expect(adapter.requestReading(request)).rejects.toMatchObject({
      code,
      httpStatus: status,
    });
  });

  it('rejects a malformed optional local admission port at construction time', () => {
    expect(() =>
      createSajuProductionReadingHttpAdapterV1({
        baseUrl: 'https://saju.example.test',
        bearerToken: 'service-credential',
        admissionPort: {} as never,
      }),
    ).toThrow(SajuProductionReadingHttpAdapterErrorV1);
  });

  it('rejects unsupported reading request bounds before transport', () => {
    expect(() =>
      buildSajuProductionReadingRequestV1({
        birthRevision: BIRTH_REVISION,
        readingText: '가'.repeat(201),
      }),
    ).toThrow(SajuProductionReadingHttpAdapterErrorV1);
  });
});
