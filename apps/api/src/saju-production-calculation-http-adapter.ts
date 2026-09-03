import {
  SajuProductionCalculationIngressErrorV1,
  ingestAuthorizedSajuProductionCalculationV1,
  type SajuBirthRevisionBindingV1,
  type SajuProductionCalculationIngressArtifactV1,
  type SajuProductionCalculationIngressErrorCodeV1,
} from '../../../packages/domain/src/index.js';
import { ApiCommandError } from './api-error.js';

export const SAJU_PRODUCTION_CALCULATION_HTTP_PATH_V1 = '/api/calculations' as const;
export const SAJU_PRODUCTION_CALCULATION_HTTP_DEFAULT_TIMEOUT_MS_V1 = 5_000 as const;
export const SAJU_PRODUCTION_CALCULATION_HTTP_MAX_TIMEOUT_MS_V1 = 30_000 as const;

export type SajuProductionCalculationHttpAdapterFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_BIRTH_REVISION'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'HTTP_UNEXPECTED_STATUS'
  | 'INVALID_CONTENT_TYPE'
  | 'INVALID_JSON'
  | 'INGRESS_REJECTED';

export class SajuProductionCalculationHttpAdapterErrorV1 extends Error {
  constructor(
    readonly code: SajuProductionCalculationHttpAdapterFailureCodeV1,
    message: string,
    readonly httpStatus: number | null = null,
    readonly ingressCode: SajuProductionCalculationIngressErrorCodeV1 | null = null,
  ) {
    super(message);
    this.name = 'SajuProductionCalculationHttpAdapterErrorV1';
  }
}

export interface SajuProductionCalculationHttpResponseV1 {
  readonly status: number;
  readonly headers: Readonly<{
    get(name: string): string | null;
  }>;
  text(): Promise<string>;
}

export interface SajuProductionCalculationHttpRequestInitV1 {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly redirect: 'manual';
  readonly signal: AbortSignal;
}

export type SajuProductionCalculationHttpFetchV1 = (
  url: string,
  init: SajuProductionCalculationHttpRequestInitV1,
) => Promise<SajuProductionCalculationHttpResponseV1>;

export interface SajuProductionCalculationHttpAdapterConfigV1 {
  readonly baseUrl: string;
  readonly bearerToken: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: SajuProductionCalculationHttpFetchV1;
}

export interface SajuProductionCalculationHttpAdapterV1 {
  calculate(
    birthRevision: SajuBirthRevisionBindingV1,
  ): Promise<SajuProductionCalculationIngressArtifactV1>;
}

export interface SajuProductionCalculationRequestV1 {
  readonly birth: Readonly<{
    calendarType: 'solar' | 'lunar';
    date: string;
    time: string | null;
    isLeapMonth?: boolean;
    sex?: 'male' | 'female' | 'unspecified';
  }>;
}

function invalidBirthRevision(message: string): never {
  throw new SajuProductionCalculationHttpAdapterErrorV1(
    'INVALID_BIRTH_REVISION',
    message,
  );
}

function requireDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return invalidBirthRevision('birthRevision.birthDate must be YYYY-MM-DD.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return invalidBirthRevision('birthRevision.birthDate is outside the supported shape.');
  }
  if (day > 31) {
    return invalidBirthRevision('birthRevision.birthDate is outside the supported shape.');
  }
  return value;
}

function requireMinutePrecisionTime(value: string): string {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/u.exec(value);
  if (match === null) {
    return invalidBirthRevision('birthRevision.birthTime must preserve minute-precision clock time.');
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second !== 0) {
    return invalidBirthRevision('birthRevision.birthTime is outside the supported minute-precision clock.');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function buildSajuProductionCalculationRequestV1(
  birthRevision: SajuBirthRevisionBindingV1,
): SajuProductionCalculationRequestV1 {
  if (birthRevision.birthRevisionRef.trim().length === 0) {
    return invalidBirthRevision('birthRevision.birthRevisionRef must be non-empty.');
  }
  if (birthRevision.calendarType !== 'solar' && birthRevision.calendarType !== 'lunar') {
    return invalidBirthRevision('birthRevision.calendarType is unsupported.');
  }
  if (
    birthRevision.sex !== null &&
    birthRevision.sex !== 'male' &&
    birthRevision.sex !== 'female' &&
    birthRevision.sex !== 'unspecified'
  ) {
    return invalidBirthRevision('birthRevision.sex is unsupported.');
  }
  if (!birthRevision.timeKnown && birthRevision.birthTime !== null) {
    return invalidBirthRevision('An unknown-time birth revision cannot carry birthTime.');
  }
  if (birthRevision.timeKnown && birthRevision.birthTime === null) {
    return invalidBirthRevision('A known-time birth revision must carry birthTime.');
  }
  if (birthRevision.calendarType === 'solar' && birthRevision.isLeapMonth) {
    return invalidBirthRevision('A solar birth revision cannot be marked as a leap month.');
  }

  const date = requireDate(birthRevision.birthDate);
  const time = birthRevision.timeKnown
    ? requireMinutePrecisionTime(birthRevision.birthTime as string)
    : null;

  return Object.freeze({
    birth: Object.freeze({
      calendarType: birthRevision.calendarType,
      date,
      time,
      ...(birthRevision.calendarType === 'lunar'
        ? { isLeapMonth: birthRevision.isLeapMonth }
        : {}),
      ...(birthRevision.sex === null ? {} : { sex: birthRevision.sex }),
    }),
  });
}

function resolveEndpoint(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'Saju calculation baseUrl must be an absolute URL.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'Saju calculation baseUrl must use http or https.',
    );
  }
  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'Saju calculation baseUrl must be an origin without credentials, path, query, or fragment.',
    );
  }

  return new URL(SAJU_PRODUCTION_CALCULATION_HTTP_PATH_V1, parsed).toString();
}

function resolveBearerToken(value: string): string {
  const bearerToken = value.trim();
  if (bearerToken.length === 0) {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_CONFIGURATION',
      'Saju calculation Bearer credential must be non-empty.',
    );
  }
  return bearerToken;
}

function resolveTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? SAJU_PRODUCTION_CALCULATION_HTTP_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > SAJU_PRODUCTION_CALCULATION_HTTP_MAX_TIMEOUT_MS_V1
  ) {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_CONFIGURATION',
      `Saju calculation timeoutMs must be an integer between 1 and ${String(SAJU_PRODUCTION_CALCULATION_HTTP_MAX_TIMEOUT_MS_V1)}.`,
    );
  }
  return timeoutMs;
}

const defaultFetch: SajuProductionCalculationHttpFetchV1 = async (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    redirect: init.redirect,
    signal: init.signal,
  });

async function fetchWithTimeout(input: {
  readonly fetchImpl: SajuProductionCalculationHttpFetchV1;
  readonly url: string;
  readonly request: SajuProductionCalculationRequestV1;
  readonly bearerToken: string;
  readonly timeoutMs: number;
}): Promise<SajuProductionCalculationHttpResponseV1> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(
        new SajuProductionCalculationHttpAdapterErrorV1(
          'TIMEOUT',
          'Saju calculation request timed out.',
        ),
      );
    }, input.timeoutMs);
  });

  try {
    return await Promise.race([
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
      timeout,
    ]);
  } catch (error) {
    if (
      error instanceof SajuProductionCalculationHttpAdapterErrorV1 &&
      error.code === 'TIMEOUT'
    ) {
      throw error;
    }
    if (timedOut) {
      throw new SajuProductionCalculationHttpAdapterErrorV1(
        'TIMEOUT',
        'Saju calculation request timed out.',
      );
    }
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju calculation transport failed before an HTTP response was accepted.',
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function assertSuccessfulStatus(status: number): void {
  if (status === 200) return;
  if (status >= 400 && status <= 499) {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'HTTP_4XX',
      'Saju calculation service rejected the request.',
      status,
    );
  }
  if (status >= 500 && status <= 599) {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'HTTP_5XX',
      'Saju calculation service failed to execute the request.',
      status,
    );
  }
  throw new SajuProductionCalculationHttpAdapterErrorV1(
    'HTTP_UNEXPECTED_STATUS',
    'Saju calculation service returned an unsupported HTTP status.',
    status,
  );
}

function assertJsonContentType(response: SajuProductionCalculationHttpResponseV1): void {
  const contentType = response.headers.get('content-type');
  if (
    contentType === null ||
    !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())
  ) {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_CONTENT_TYPE',
      'Saju calculation service returned a non-JSON success response.',
      response.status,
    );
  }
}

async function parseJsonResponse(
  response: SajuProductionCalculationHttpResponseV1,
): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju calculation response body could not be read.',
      response.status,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SajuProductionCalculationHttpAdapterErrorV1(
      'INVALID_JSON',
      'Saju calculation service returned malformed JSON.',
      response.status,
    );
  }
}

export function createSajuProductionCalculationHttpAdapterV1(
  config: SajuProductionCalculationHttpAdapterConfigV1,
): SajuProductionCalculationHttpAdapterV1 {
  const url = resolveEndpoint(config.baseUrl);
  const bearerToken = resolveBearerToken(config.bearerToken);
  const timeoutMs = resolveTimeoutMs(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? defaultFetch;

  return Object.freeze({
    async calculate(
      birthRevision: SajuBirthRevisionBindingV1,
    ): Promise<SajuProductionCalculationIngressArtifactV1> {
      const request = buildSajuProductionCalculationRequestV1(birthRevision);
      const response = await fetchWithTimeout({ fetchImpl, url, request, bearerToken, timeoutMs });
      assertSuccessfulStatus(response.status);
      assertJsonContentType(response);
      const payload = await parseJsonResponse(response);

      try {
        return ingestAuthorizedSajuProductionCalculationV1({
          response: payload,
          birthRevision,
        });
      } catch (error) {
        if (error instanceof SajuProductionCalculationIngressErrorV1) {
          throw new SajuProductionCalculationHttpAdapterErrorV1(
            'INGRESS_REJECTED',
            'Saju calculation response failed the MyeongHa production ingress boundary.',
            response.status,
            error.code,
          );
        }
        throw error;
      }
    },
  });
}

export function toSajuProductionCalculationApiErrorV1(
  error: unknown,
): ApiCommandError {
  if (error instanceof ApiCommandError) return error;
  return new ApiCommandError(
    'SAJU_TEMPORARILY_UNAVAILABLE',
    'Saju calculation is temporarily unavailable.',
  );
}
