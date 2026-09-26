import { ApiCommandError } from './api-error.js';
import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import {
  readBoundCurrentBirthProfileV1,
} from './current-subject-saju-calculation-http.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createIngressRequestBodyCompletionDeadlineLeaseV1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { executeCurrentBirthProfileSajuReadingV1 } from './saju-production-reading-execution.js';
import {
  SajuProductionReadingHttpAdapterErrorV1,
  type SajuProductionReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';

const POST_METHOD = 'POST' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  route: '/api/me/saju/preview-reading',
  lifecycle: 'preview',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export const CURRENT_SUBJECT_SAJU_PREVIEW_READING_TEXTS_V1 = Object.freeze([
  '전체 사주',
  '직업운',
  '재물운',
  '연애운',
  '사업운',
] as const);

const supportedReadingTexts = new Set<string>(
  CURRENT_SUBJECT_SAJU_PREVIEW_READING_TEXTS_V1,
);

export interface HandleCurrentSubjectSajuPreviewReadingRequestInputV1<AdmittedResponse> {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly sajuAdapter: SajuProductionReadingHttpAdapterV1<AdmittedResponse>;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Current-subject Saju Preview Reading ${name} is invalid.`);
  }
  return value.trim();
}

function requireServerTime(value: string): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Current-subject Saju Preview Reading server time is invalid.');
  }
  return serverTime;
}

function routeMatches(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.pathname === CURRENT_SUBJECT_SAJU_PREVIEW_READING_HTTP_BINDINGS_V1.route &&
    url.search === '' &&
    url.hash === ''
  );
}

function errorResponse(input: {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly requestId: string;
}): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        messageKey: input.messageKey,
        retryable: input.retryable,
      },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId: input.requestId,
      },
    },
    {
      status: input.status,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    },
  );
}

function successResponse(
  reading: unknown,
  requestId: string,
  serverTime: string,
): Response {
  return Response.json(
    {
      ok: true,
      data: {
        lifecycle: 'preview',
        reading,
      },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId,
        serverTime,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    },
  );
}

function parseRequestBody(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'readingText') return null;
  if (typeof record.readingText !== 'string') return null;
  const readingText = record.readingText.trim();
  if (readingText.length === 0 || readingText.length > 200) return null;
  return readingText;
}

export async function handleCurrentSubjectSajuPreviewReadingRequestV1<AdmittedResponse>(
  input: HandleCurrentSubjectSajuPreviewReadingRequestInputV1<AdmittedResponse>,
): Promise<Response> {
  if (!routeMatches(input.request)) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    });
  }
  if (input.request.method !== POST_METHOD) {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: POST_METHOD,
        'Cache-Control': NO_STORE_CACHE_CONTROL,
      },
    });
  }

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(
    input.request,
  );
  if (verifiedEvidence === null) {
    return errorResponse({
      status: 401,
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
      requestId,
    });
  }

  const bodyDeadline = createIngressRequestBodyCompletionDeadlineLeaseV1();
  let requestBody: unknown;
  try {
    requestBody = await readAuthenticatedJsonRequestBodyV1(input.request, {
      waitForRead: (pending) => bodyDeadline.waitFor(pending),
    });
  } catch (error) {
    if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
      return errorResponse({
        status: 413,
        code: 'REQUEST_TOO_LARGE',
        messageKey: 'request.too_large',
        retryable: false,
        requestId,
      });
    }
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
      return errorResponse({
        status: 408,
        code: 'REQUEST_BODY_TIMEOUT',
        messageKey: 'auth.request_body_timeout',
        retryable: false,
        requestId,
      });
    }
    return errorResponse({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  } finally {
    bodyDeadline.release();
  }

  const readingText = parseRequestBody(requestBody);
  if (readingText === null) {
    return errorResponse({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }
  if (!supportedReadingTexts.has(readingText)) {
    return errorResponse({
      status: 409,
      code: 'SAJU_PREVIEW_READING_UNAVAILABLE',
      messageKey: 'saju.preview_reading_unavailable',
      retryable: false,
      requestId,
    });
  }

  try {
    const profile = await readBoundCurrentBirthProfileV1({
      pool: input.pool,
      verifiedEvidence,
    });
    const reading = await executeCurrentBirthProfileSajuReadingV1({
      profile,
      readingText,
      adapter: input.sajuAdapter,
    });
    return successResponse(reading, requestId, serverTime);
  } catch (error) {
    if (error instanceof ApiCommandError) {
      if (error.code === 'NOT_FOUND') {
        return errorResponse({
          status: 404,
          code: 'NOT_FOUND',
          messageKey: 'birth_profile.required',
          retryable: false,
          requestId,
        });
      }
      if (error.code === 'AUTH_REQUIRED') {
        return errorResponse({
          status: 401,
          code: 'AUTH_REQUIRED',
          messageKey: 'auth.required',
          retryable: false,
          requestId,
        });
      }
    }
    if (error instanceof SajuProductionReadingHttpAdapterErrorV1) {
      return errorResponse({
        status: 503,
        code: 'SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE',
        messageKey: 'saju.preview_temporarily_unavailable',
        retryable: true,
        requestId,
      });
    }
    return errorResponse({
      status: 503,
      code: 'SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE',
      messageKey: 'saju.preview_temporarily_unavailable',
      retryable: true,
      requestId,
    });
  }
}
