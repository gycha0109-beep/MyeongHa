import type { SajuBirthRevisionBindingV1 } from '../../../packages/domain/src/index.js';
import {
  buildSajuProductionCalculationRequestV1,
  type SajuProductionCalculationHttpFetchV1,
  type SajuProductionCalculationHttpResponseV1,
} from './saju-production-calculation-http-adapter.js';

export const SAJU_PRODUCTION_READING_HTTP_PATH_V1 = '/api/readings' as const;
export const SAJU_PREVIEW_READING_HTTP_PATH_V1 = '/api/preview/readings' as const;
export const SAJU_READING_LIFECYCLE_HEADER_V1 = 'x-myeonghwa-reading-lifecycle' as const;
export const SAJU_PREVIEW_READING_LIFECYCLE_V1 = 'preview' as const;
export const SAJU_PRODUCTION_READING_HTTP_DEFAULT_TIMEOUT_MS_V1 = 15_000 as const;
export const SAJU_PRODUCTION_READING_HTTP_MAX_TIMEOUT_MS_V1 = 60_000 as const;
export const SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1 =
  'x-myeonghwa-product-reading-response-admitted' as const;
export const SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1 =
  'myeonghwa-product-reading-response-v2' as const;

export type SajuProductionReadingHttpAdapterFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_READING_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'HTTP_UNEXPECTED_STATUS'
  | 'INVALID_CONTENT_TYPE'
  | 'INVALID_JSON'
  | 'RESPONSE_ADMISSION_ATTESTATION_REJECTED'
  | 'RESPONSE_LIFECYCLE_ATTESTATION_REJECTED'
  | 'RESPONSE_ADMISSION_REJECTED';

export class SajuProductionReadingHttpAdapterErrorV1 extends Error {
  constructor(
    readonly code: SajuProductionReadingHttpAdapterFailureCodeV1,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'SajuProductionReadingHttpAdapterErrorV1';
  }
}

export interface SajuProductReadingResponseAdmissionPortV1<AdmittedResponse = unknown> {
  admit(input: unknown): AdmittedResponse;
}

export interface SajuProductionReadingRequestV1 {
  readonly birth: Readonly<{
    calendarType: 'solar' | 'lunar';
    date: string;
    time: string | null;
    isLeapMonth?: boolean;
    sex?: 'male' | 'female' | 'unspecified';
  }>;
  readonly reading: Readonly<{
    text: string;
    targetPersonRef?: string;
  }>;
}

export interface SajuProductionReadingHttpAdapterV1<AdmittedResponse = unknown> {
  requestReading(
    request: SajuProductionReadingRequestV1,
  ): Promise<AdmittedResponse>;
}

interface SajuProductionReadingHttpDeadlineLeaseV1 {
  readonly response: SajuProductionCalculationHttpResponseV1;
  readonly deadline: Promise<never>;
  readonly didTimeout: () => boolean;
  readonly release: () => void;
}

export interface SajuProductionReadingHttpAdapterConfigV1<AdmittedResponse = unknown> {
  readonly baseUrl: string;
  readonly bearerToken: string;
  /**
   * Optional defense-in-depth admission. The authoritative source admission is performed
   * by Saju before transport and attested on the authenticated HTTP response.
   */
  readonly admissionPort?: SajuProductReadingResponseAdmissionPortV1<AdmittedResponse>;
  readonly timeoutMs?: number;
  readonly fetchImpl?: SajuProductionCalculationHttpFetchV1;
}

function failConfiguration(message: string): never {
  throw new SajuProductionReadingHttpAdapterErrorV1(
    'INVALID_CONFIGURATION',
    message,
  );
}

function resolveEndpoint(baseUrl: string, path: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return failConfiguration('Saju reading baseUrl must be an absolute URL.');
  }

  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:'
  ) {
    return failConfiguration('Saju reading baseUrl must use http or https.');
  }
  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    return failConfiguration(
      'Saju reading baseUrl must be an origin without credentials, path, query, or fragment.',
    );
  }

  return new URL(path, parsed).toString();
}

function resolveBearerToken(value: string): string {
  const token = value.trim();
  if (token.length === 0) {
    return failConfiguration('Saju reading service credential must be non-empty.');
  }
  return token;
}

function resolveTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? SAJU_PRODUCTION_READING_HTTP_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > SAJU_PRODUCTION_READING_HTTP_MAX_TIMEOUT_MS_V1
  ) {
    return failConfiguration(
      `Saju reading timeoutMs must be an integer between 1 and ${String(SAJU_PRODUCTION_READING_HTTP_MAX_TIMEOUT_MS_V1)}.`,
    );
  }
  return timeoutMs;
}

function requireNonBlank(name: string, value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'INVALID_READING_REQUEST',
      `${name} must be a string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'INVALID_READING_REQUEST',
      `${name} is outside the supported bounds.`,
    );
  }
  return normalized;
}

export function buildSajuProductionReadingRequestV1(input: {
  readonly birthRevision: SajuBirthRevisionBindingV1;
  readonly readingText: string;
  readonly targetPersonRef?: string;
}): SajuProductionReadingRequestV1 {
  const calculationRequest = buildSajuProductionCalculationRequestV1(input.birthRevision);
  const text = requireNonBlank('readingText', input.readingText, 200);
  const targetPersonRef =
    input.targetPersonRef === undefined
      ? undefined
      : requireNonBlank('targetPersonRef', input.targetPersonRef, 200);

  return Object.freeze({
    birth: calculationRequest.birth,
    reading: Object.freeze({
      text,
      ...(targetPersonRef === undefined ? {} : { targetPersonRef }),
    }),
  });
}

const defaultFetch: SajuProductionCalculationHttpFetchV1 = async (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    redirect: init.redirect,
    signal: init.signal,
  });

function timeoutError(): SajuProductionReadingHttpAdapterErrorV1 {
  return new SajuProductionReadingHttpAdapterErrorV1(
    'TIMEOUT',
    'Saju reading request timed out.',
  );
}

async function fetchWithTimeout(input: {
  readonly fetchImpl: SajuProductionCalculationHttpFetchV1;
  readonly url: string;
  readonly request: SajuProductionReadingRequestV1;
  readonly bearerToken: string;
  readonly timeoutMs: number;
}): Promise<SajuProductionReadingHttpDeadlineLeaseV1> {
  const controller = new AbortController();
  let timedOut = false;
  let released = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = timeoutError();
      reject(error);
      controller.abort();
    }, input.timeoutMs);
  });

  const release = (): void => {
    if (released) return;
    released = true;
    if (timer !== undefined) clearTimeout(timer);
  };

  try {
    const response = await Promise.race([
      input.fetchImpl(input.url, {
        method: 'POST',
        headers: Object.freeze({
          accept: 'application/json',
          authorization: `Bearer ${input.bearerToken}`,
          'content-type': 'application/json',
        }),
        body: JSON.stringify(input.request),
        redirect: 'manual',
        signal: controller.signal,
      }),
      deadline,
    ]);

    return Object.freeze({
      response,
      deadline,
      didTimeout: () => timedOut,
      release,
    });
  } catch (error) {
    release();
    if (
      timedOut ||
      (error instanceof SajuProductionReadingHttpAdapterErrorV1 &&
        error.code === 'TIMEOUT')
    ) {
      throw timeoutError();
    }
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju reading transport failed before an HTTP response was accepted.',
    );
  }
}

function cancelUnusedResponseBody(
  response: SajuProductionCalculationHttpResponseV1,
): void {
  try {
    const body = response.body;
    if (body === undefined || body === null) return;
    void body.cancel().catch(() => undefined);
  } catch {
    return;
  }
}

function assertSuccessfulStatus(response: SajuProductionCalculationHttpResponseV1): void {
  const { status } = response;
  if (status === 200) return;
  cancelUnusedResponseBody(response);

  if (status >= 400 && status <= 499) {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'HTTP_4XX',
      'Saju reading service rejected the request.',
      status,
    );
  }
  if (status >= 500 && status <= 599) {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'HTTP_5XX',
      'Saju reading service failed to execute the request.',
      status,
    );
  }
  throw new SajuProductionReadingHttpAdapterErrorV1(
    'HTTP_UNEXPECTED_STATUS',
    'Saju reading service returned an unsupported HTTP status.',
    status,
  );
}

function assertJsonContentType(response: SajuProductionCalculationHttpResponseV1): void {
  const contentType = response.headers.get('content-type');
  if (
    contentType === null ||
    !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())
  ) {
    cancelUnusedResponseBody(response);
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'INVALID_CONTENT_TYPE',
      'Saju reading service returned a non-JSON success response.',
      response.status,
    );
  }
}

function assertSourceAdmissionAttestation(
  response: SajuProductionCalculationHttpResponseV1,
): void {
  const attestedVersion = response.headers.get(
    SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1,
  );
  if (attestedVersion !== SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1) {
    cancelUnusedResponseBody(response);
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'RESPONSE_ADMISSION_ATTESTATION_REJECTED',
      'Saju reading response was not attested by the source-owned ProductReadingResponse admission boundary.',
      response.status,
    );
  }
}

function assertLifecycleAttestation(
  response: SajuProductionCalculationHttpResponseV1,
  expectedLifecycle: string | undefined,
): void {
  if (expectedLifecycle === undefined) return;
  const lifecycle = response.headers.get(SAJU_READING_LIFECYCLE_HEADER_V1);
  if (lifecycle !== expectedLifecycle) {
    cancelUnusedResponseBody(response);
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'RESPONSE_LIFECYCLE_ATTESTATION_REJECTED',
      'Saju reading response lifecycle attestation did not match the requested lifecycle.',
      response.status,
    );
  }
}

function assertAttestedEnvelopeVersion(payload: unknown): void {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload) ||
    (payload as { responseVersion?: unknown }).responseVersion !==
      SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1
  ) {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'RESPONSE_ADMISSION_ATTESTATION_REJECTED',
      'Saju reading response envelope does not match its source admission attestation.',
      200,
    );
  }
}

async function parseJsonResponse(
  response: SajuProductionCalculationHttpResponseV1,
  deadline: Promise<never>,
  didTimeout: () => boolean,
): Promise<unknown> {
  let text: string;
  try {
    text = await Promise.race([response.text(), deadline]);
  } catch (error) {
    if (
      didTimeout() ||
      (error instanceof SajuProductionReadingHttpAdapterErrorV1 &&
        error.code === 'TIMEOUT')
    ) {
      throw timeoutError();
    }
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju reading response body could not be read.',
      response.status,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SajuProductionReadingHttpAdapterErrorV1(
      'INVALID_JSON',
      'Saju reading service returned malformed JSON.',
      response.status,
    );
  }
}

function createSajuReadingHttpAdapterV1<AdmittedResponse>(
  config: SajuProductionReadingHttpAdapterConfigV1<AdmittedResponse>,
  endpointPath: string,
  expectedLifecycle?: string,
): SajuProductionReadingHttpAdapterV1<AdmittedResponse> {
  const url = resolveEndpoint(config.baseUrl, endpointPath);
  const bearerToken = resolveBearerToken(config.bearerToken);
  const timeoutMs = resolveTimeoutMs(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? defaultFetch;

  if (
    config.admissionPort !== undefined &&
    typeof config.admissionPort.admit !== 'function'
  ) {
    return failConfiguration(
      'Saju ProductReadingResponse admission authority must expose admit when configured.',
    );
  }

  return Object.freeze({
    async requestReading(
      request: SajuProductionReadingRequestV1,
    ): Promise<AdmittedResponse> {
      const lease = await fetchWithTimeout({
        fetchImpl,
        url,
        request,
        bearerToken,
        timeoutMs,
      });

      try {
        const { response } = lease;
        assertSuccessfulStatus(response);
        assertJsonContentType(response);
        assertSourceAdmissionAttestation(response);
        assertLifecycleAttestation(response, expectedLifecycle);
        const payload = await parseJsonResponse(
          response,
          lease.deadline,
          lease.didTimeout,
        );
        assertAttestedEnvelopeVersion(payload);

        if (config.admissionPort === undefined) {
          return payload as AdmittedResponse;
        }

        try {
          return config.admissionPort.admit(payload);
        } catch {
          throw new SajuProductionReadingHttpAdapterErrorV1(
            'RESPONSE_ADMISSION_REJECTED',
            'Saju ProductReadingResponse failed the configured defense-in-depth admission boundary.',
            response.status,
          );
        }
      } finally {
        lease.release();
      }
    },
  });
}

export function createSajuProductionReadingHttpAdapterV1<AdmittedResponse>(
  config: SajuProductionReadingHttpAdapterConfigV1<AdmittedResponse>,
): SajuProductionReadingHttpAdapterV1<AdmittedResponse> {
  return createSajuReadingHttpAdapterV1(
    config,
    SAJU_PRODUCTION_READING_HTTP_PATH_V1,
  );
}

export function createSajuPreviewReadingHttpAdapterV1<AdmittedResponse>(
  config: SajuProductionReadingHttpAdapterConfigV1<AdmittedResponse>,
): SajuProductionReadingHttpAdapterV1<AdmittedResponse> {
  return createSajuReadingHttpAdapterV1(
    config,
    SAJU_PREVIEW_READING_HTTP_PATH_V1,
    SAJU_PREVIEW_READING_LIFECYCLE_V1,
  );
}
