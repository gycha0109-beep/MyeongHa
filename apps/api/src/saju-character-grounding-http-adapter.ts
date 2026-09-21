import type {
  OfficialReadingCharacterGroundingProjectionInputV1,
  OfficialReadingCharacterGroundingProjectionPortV1,
} from './reader-interpretation-preview-runtime-v1.js';
import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import type {
  SajuProductionCalculationHttpFetchV1,
  SajuProductionCalculationHttpResponseV1,
} from './saju-production-calculation-http-adapter.js';

export const SAJU_CHARACTER_GROUNDING_HTTP_PATH_V1 =
  '/api/character-grounding' as const;
export const SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1 =
  'x-myeonghwa-character-grounding-admitted' as const;
export const SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1 =
  'myeonghwa-character-grounding-v1' as const;
export const SAJU_CHARACTER_GROUNDING_HTTP_DEFAULT_TIMEOUT_MS_V1 = 10_000 as const;
export const SAJU_CHARACTER_GROUNDING_HTTP_MAX_TIMEOUT_MS_V1 = 60_000 as const;

export type SajuCharacterGroundingHttpAdapterFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'HTTP_UNEXPECTED_STATUS'
  | 'INVALID_CONTENT_TYPE'
  | 'INVALID_JSON'
  | 'ADMISSION_ATTESTATION_REJECTED'
  | 'GROUNDING_IDENTITY_REJECTED';

export class SajuCharacterGroundingHttpAdapterErrorV1 extends Error {
  constructor(
    readonly code: SajuCharacterGroundingHttpAdapterFailureCodeV1,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = 'SajuCharacterGroundingHttpAdapterErrorV1';
  }
}

export interface SajuCharacterGroundingHttpAdapterConfigV1 {
  readonly baseUrl: string;
  readonly bearerToken: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: SajuProductionCalculationHttpFetchV1;
}

function failConfiguration(message: string): never {
  throw new SajuCharacterGroundingHttpAdapterErrorV1(
    'INVALID_CONFIGURATION',
    message,
  );
}

function resolveEndpoint(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return failConfiguration(
      'Saju Character grounding baseUrl must be an absolute URL.',
    );
  }
  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:'
  ) {
    return failConfiguration(
      'Saju Character grounding baseUrl must use http or https.',
    );
  }
  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    return failConfiguration(
      'Saju Character grounding baseUrl must be an origin without credentials, path, query, or fragment.',
    );
  }
  return new URL(SAJU_CHARACTER_GROUNDING_HTTP_PATH_V1, parsed).toString();
}

function resolveBearerToken(value: string): string {
  const token = value.trim();
  if (token.length === 0) {
    return failConfiguration(
      'Saju Character grounding Bearer credential must be non-empty.',
    );
  }
  return token;
}

function resolveTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? SAJU_CHARACTER_GROUNDING_HTTP_DEFAULT_TIMEOUT_MS_V1;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > SAJU_CHARACTER_GROUNDING_HTTP_MAX_TIMEOUT_MS_V1
  ) {
    return failConfiguration(
      `Saju Character grounding timeoutMs must be an integer between 1 and ${String(
        SAJU_CHARACTER_GROUNDING_HTTP_MAX_TIMEOUT_MS_V1,
      )}.`,
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

function timeoutError(): SajuCharacterGroundingHttpAdapterErrorV1 {
  return new SajuCharacterGroundingHttpAdapterErrorV1(
    'TIMEOUT',
    'Saju Character grounding request timed out.',
  );
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

function assertSuccessfulStatus(
  response: SajuProductionCalculationHttpResponseV1,
): void {
  const { status } = response;
  if (status === 200) return;
  cancelUnusedResponseBody(response);
  if (status >= 400 && status <= 499) {
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'HTTP_4XX',
      'Saju Character grounding service rejected the request.',
      status,
    );
  }
  if (status >= 500 && status <= 599) {
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'HTTP_5XX',
      'Saju Character grounding service failed to execute the request.',
      status,
    );
  }
  throw new SajuCharacterGroundingHttpAdapterErrorV1(
    'HTTP_UNEXPECTED_STATUS',
    'Saju Character grounding service returned an unsupported HTTP status.',
    status,
  );
}

function assertJsonContentType(
  response: SajuProductionCalculationHttpResponseV1,
): void {
  const contentType = response.headers.get('content-type');
  if (
    contentType === null ||
    !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())
  ) {
    cancelUnusedResponseBody(response);
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'INVALID_CONTENT_TYPE',
      'Saju Character grounding service returned a non-JSON success response.',
      response.status,
    );
  }
}

function assertAdmissionAttestation(
  response: SajuProductionCalculationHttpResponseV1,
): void {
  if (
    response.headers.get(SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1) !==
    SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1
  ) {
    cancelUnusedResponseBody(response);
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'ADMISSION_ATTESTATION_REJECTED',
      'Saju Character grounding response lacks source-owned admission attestation.',
      response.status,
    );
  }
}

function assertProjectedIdentity(
  input: OfficialReadingCharacterGroundingProjectionInputV1,
  candidate: unknown,
): void {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'GROUNDING_IDENTITY_REJECTED',
      'Saju Character grounding response must be an object.',
      200,
    );
  }
  const bundle = candidate as Record<string, unknown>;
  if (
    bundle.readingRef !== input.readingId ||
    bundle.productResponseVersion !== input.readingContractVersion ||
    bundle.engineVersion !== input.sajuEngineVersion ||
    bundle.readingDomain !== input.sajuDomain
  ) {
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'GROUNDING_IDENTITY_REJECTED',
      'Saju Character grounding response identity does not match the authorized Official Reading source.',
      200,
    );
  }
}

async function parseJson(
  response: SajuProductionCalculationHttpResponseV1,
): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'NETWORK_FAILURE',
      'Saju Character grounding response body could not be read.',
      response.status,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SajuCharacterGroundingHttpAdapterErrorV1(
      'INVALID_JSON',
      'Saju Character grounding service returned malformed JSON.',
      response.status,
    );
  }
}

export function createSajuCharacterGroundingHttpAdapterV1(
  config: SajuCharacterGroundingHttpAdapterConfigV1,
): OfficialReadingCharacterGroundingProjectionPortV1 {
  const url = resolveEndpoint(config.baseUrl);
  const bearerToken = resolveBearerToken(config.bearerToken);
  const timeoutMs = resolveTimeoutMs(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? defaultFetch;

  return Object.freeze({
    async projectGrounding(
      input: OfficialReadingCharacterGroundingProjectionInputV1,
    ): Promise<unknown> {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      let response: SajuProductionCalculationHttpResponseV1;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: Object.freeze({
            accept: 'application/json',
            authorization: `Bearer ${bearerToken}`,
            'content-type': 'application/json',
          }),
          body: JSON.stringify({
            response: input.responseSnapshotJsonb,
            engineVersion: input.sajuEngineVersion,
            readingDomain: input.sajuDomain,
          }),
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch {
        if (timedOut) throw timeoutError();
        throw new SajuCharacterGroundingHttpAdapterErrorV1(
          'NETWORK_FAILURE',
          'Saju Character grounding transport failed before an HTTP response was accepted.',
        );
      } finally {
        clearTimeout(timer);
      }

      assertSuccessfulStatus(response);
      assertJsonContentType(response);
      assertAdmissionAttestation(response);
      const candidate = await parseJson(response);
      assertProjectedIdentity(input, candidate);
      return candidate;
    },
  });
}

export function createProductionSajuCharacterGroundingProjectionPortV1(input: {
  readonly env: ProductionSajuRuntimeEnvV1;
  readonly timeoutMs?: number;
  readonly fetchImpl?: SajuProductionCalculationHttpFetchV1;
}): OfficialReadingCharacterGroundingProjectionPortV1 {
  const config = parseProductionSajuRuntimeConfigV1(input.env);
  return createSajuCharacterGroundingHttpAdapterV1({
    baseUrl: config.serviceOrigin,
    bearerToken: config.serviceBearer,
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
  });
}
