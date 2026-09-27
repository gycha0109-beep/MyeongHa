import {
  fingerprintMemberAuthClientV1,
  readTrustedVercelClientIpV1,
} from './member-auth-client-network-key.js';
import type {
  MemberAuthRateLimitActionV1,
  MemberAuthRateLimitAdmissionPortV1,
} from './member-auth-rate-limit.js';

const NO_STORE = 'no-store' as const;
const MAXIMUM_RETRY_AFTER_SECONDS = 60;

export interface MemberAuthRateLimitHttpInputV1 {
  readonly request: Request;
  readonly action: MemberAuthRateLimitActionV1;
  readonly secret: string;
  readonly admissionPort: MemberAuthRateLimitAdmissionPortV1;
  readonly next: () => Promise<Response>;
  readonly nowMs?: () => number;
}

function cancelUnusedRequestBodyBestEffort(request: Request): void {
  const body = request.body;
  if (body === null || request.bodyUsed) return;
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Admission failure is authoritative; body cleanup is best-effort only.
  }
}

function authRateLimitErrorResponse(
  code: 'RATE_LIMITED' | 'AUTH_RATE_LIMIT_UNAVAILABLE',
  status: 429 | 503,
  retryAfterSeconds?: number,
): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code,
        messageKey: `auth.${code.toLowerCase()}`,
        retryable: status >= 500,
      },
    },
    {
      status,
      headers: {
        'Cache-Control': NO_STORE,
        ...(retryAfterSeconds === undefined
          ? {}
          : { 'Retry-After': String(retryAfterSeconds) }),
      },
    },
  );
}

export function createMemberAuthRateLimitUnavailableResponseV1(
  request: Request,
): Response {
  cancelUnusedRequestBodyBestEffort(request);
  return authRateLimitErrorResponse('AUTH_RATE_LIMIT_UNAVAILABLE', 503);
}

function retryAfterSeconds(resetAt: string, nowMs: number): number {
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs)) {
    throw new Error('Member Auth rate-limit reset timestamp is invalid.');
  }
  return Math.max(
    1,
    Math.min(
      MAXIMUM_RETRY_AFTER_SECONDS,
      Math.ceil((resetMs - nowMs) / 1000),
    ),
  );
}

export async function handleMemberAuthRateLimitHttpV1(
  input: MemberAuthRateLimitHttpInputV1,
): Promise<Response> {
  if (input.request.method !== 'POST') {
    return input.next();
  }

  let admission;
  try {
    const clientIp = readTrustedVercelClientIpV1(input.request);
    const clientFingerprint = fingerprintMemberAuthClientV1({
      clientIp,
      action: input.action,
      secret: input.secret,
    });
    admission = await input.admissionPort.admit({
      action: input.action,
      clientFingerprint,
    });
  } catch {
    return createMemberAuthRateLimitUnavailableResponseV1(input.request);
  }

  if (!admission.allowed) {
    let retryAfter: number;
    try {
      retryAfter = retryAfterSeconds(
        admission.resetAt,
        input.nowMs?.() ?? Date.now(),
      );
    } catch {
      return createMemberAuthRateLimitUnavailableResponseV1(input.request);
    }
    cancelUnusedRequestBodyBestEffort(input.request);
    return authRateLimitErrorResponse('RATE_LIMITED', 429, retryAfter);
  }

  return input.next();
}
