import type { SajuHeldSourceProofIssuePortV1 } from './saju-held-source-proof-revision-binding-v1.js';
import {
  SAJU_READING_JSON_RESPONSE_MAXIMUM_BYTES_V1,
  UpstreamJsonResponseTooLargeV1,
  readBoundedUpstreamJsonTextV1,
} from './upstream-json-response-resource.js';

export const SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1 =
  '/api/internal/preview/source-readings' as const;
export const SAJU_HELD_SOURCE_PROOF_HTTP_DEFAULT_TIMEOUT_MS_V1 = 15_000 as const;
export const SAJU_HELD_SOURCE_PROOF_HTTP_MAX_TIMEOUT_MS_V1 = 30_000 as const;
export const SAJU_HELD_SOURCE_PROOF_HTTP_REQUEST_MAXIMUM_BYTES_V1 = 16_384 as const;

const NONCE = /^[a-zA-Z0-9_-]{22,128}$/u;
const ALLOWED_READING_TEXTS = new Set(['전체 사주', '연애운']);

export type SajuHeldSourceProofHttpFailureCodeV1 =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'UPSTREAM_REJECTED'
  | 'INVALID_RESPONSE'
  | 'RESPONSE_TOO_LARGE';

export class SajuHeldSourceProofHttpErrorV1 extends Error {
  constructor(readonly code: SajuHeldSourceProofHttpFailureCodeV1) {
    super('Protected Saju source proof transport is unavailable.');
    this.name = 'SajuHeldSourceProofHttpErrorV1';
  }
}

export interface SajuHeldSourceProofHttpResponseV1 {
  readonly status: number;
  readonly headers: Readonly<{ get(name: string): string | null }>;
  readonly body?: ReadableStream<Uint8Array> | null;
}

export interface SajuHeldSourceProofHttpFetchInitV1 {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly redirect: 'manual';
  readonly signal: AbortSignal;
}

export type SajuHeldSourceProofHttpFetchV1 = (
  url: string,
  init: SajuHeldSourceProofHttpFetchInitV1,
) => Promise<SajuHeldSourceProofHttpResponseV1>;

export interface SajuHeldSourceProofHttpClientOptionsV1 {
  /** Trusted server configuration only. Never provide a user-selectable URL. */
  readonly serviceOrigin: string;
  /** Dedicated service credential, not the transport proof HMAC signing secret. */
  readonly serviceBearer: string;
  readonly timeoutMs?: number;
  /** Synthetic loopback tests only. Production uses the platform fetch. */
  readonly fetchImpl?: SajuHeldSourceProofHttpFetchV1;
}

function fail(code: SajuHeldSourceProofHttpFailureCodeV1): never {
  throw new SajuHeldSourceProofHttpErrorV1(code);
}

function resolveOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('INVALID_CONFIGURATION');
  }
  if (url.protocol !== 'https:'
    || url.username !== '' || url.password !== '' || url.hostname.length === 0
    || url.pathname !== '/' || url.search !== '' || url.hash !== ''
    || url.origin !== value) return fail('INVALID_CONFIGURATION');
  return url.origin;
}

function resolveBearer(value: string): string {
  if (typeof value !== 'string' || value.trim() !== value
    || value.length < 1 || value.length > 4096
    || /[\r\n]/u.test(value)) return fail('INVALID_CONFIGURATION');
  return value;
}

function resolveTimeout(value: number | undefined): number {
  const timeout = value ?? SAJU_HELD_SOURCE_PROOF_HTTP_DEFAULT_TIMEOUT_MS_V1;
  if (!Number.isSafeInteger(timeout) || timeout < 1
    || timeout > SAJU_HELD_SOURCE_PROOF_HTTP_MAX_TIMEOUT_MS_V1) {
    return fail('INVALID_CONFIGURATION');
  }
  return timeout;
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function outboundBody(input: Parameters<SajuHeldSourceProofIssuePortV1['issuePreviewProof']>[0]): string {
  if (!NONCE.test(input.nonce)
    || !exactKeys(input.request, ['birth', 'reading'])
    || !exactKeys(input.request.reading, ['text'])
    || !ALLOWED_READING_TEXTS.has(input.request.reading.text as string)
    || typeof input.request.birth !== 'object' || input.request.birth === null
    || Array.isArray(input.request.birth)
    || Object.keys(input.request.birth).some(key =>
      !['calendarType', 'date', 'time', 'isLeapMonth', 'sex'].includes(key))) {
    return fail('INVALID_REQUEST');
  }

  const body = JSON.stringify({ nonce: input.nonce, request: input.request });
  if (Buffer.byteLength(body, 'utf8') > SAJU_HELD_SOURCE_PROOF_HTTP_REQUEST_MAXIMUM_BYTES_V1) {
    return fail('INVALID_REQUEST');
  }
  return body;
}

function discard(response: SajuHeldSourceProofHttpResponseV1): void {
  try {
    const body = response.body;
    if (body !== null && body !== undefined) void body.cancel().catch(() => undefined);
  } catch {
    // Preserve the primary failure; never wait for remote cleanup.
  }
}

const defaultFetch: SajuHeldSourceProofHttpFetchV1 = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, body: init.body,
    redirect: init.redirect, signal: init.signal });

/**
 * Server-only protected Saju issuer connector. The response is deliberately
 * UNKNOWN until verifySajuHeldSourceProofV1 checks the cryptographic envelope.
 * No route registration, runtime env resolver or Production activation occurs.
 */
export function createSajuHeldSourceProofHttpIssuePortV1(
  options: SajuHeldSourceProofHttpClientOptionsV1,
): SajuHeldSourceProofIssuePortV1 {
  const endpoint = resolveOrigin(options.serviceOrigin) +
    SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1;
  const bearer = resolveBearer(options.serviceBearer);
  const timeout = resolveTimeout(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  if (typeof fetchImpl !== 'function') return fail('INVALID_CONFIGURATION');

  return Object.freeze({
    async issuePreviewProof(input) {
      const body = outboundBody(input);
      const controller = new AbortController();
      let timedOut = false;
      let stop: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        stop = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new SajuHeldSourceProofHttpErrorV1('TIMEOUT'));
        }, timeout);
      });
      let response: SajuHeldSourceProofHttpResponseV1 | undefined;
      try {
        response = await Promise.race([
          fetchImpl(endpoint, {
            method: 'POST',
            headers: Object.freeze({
              accept: 'application/json',
              authorization: 'Bearer ' + bearer,
              'content-type': 'application/json',
            }),
            body, redirect: 'manual', signal: controller.signal,
          }),
          deadline,
        ]);

        if (response.status !== 200) {
          discard(response);
          return fail('UPSTREAM_REJECTED');
        }
        if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
          !== 'application/json'
          || !response.headers.get('cache-control')?.toLowerCase().split(',')
            .some(part => part.trim() === 'no-store')) {
          discard(response);
          return fail('INVALID_RESPONSE');
        }

        const json = await Promise.race([
          readBoundedUpstreamJsonTextV1(response, {
            maximumBodyBytes: SAJU_READING_JSON_RESPONSE_MAXIMUM_BYTES_V1,
            signal: controller.signal,
          }),
          deadline,
        ]);
        if (json.length === 0) return fail('INVALID_RESPONSE');
        try {
          return JSON.parse(json) as unknown;
        } catch {
          return fail('INVALID_RESPONSE');
        }
      } catch (error) {
        if (error instanceof SajuHeldSourceProofHttpErrorV1) throw error;
        if (error instanceof UpstreamJsonResponseTooLargeV1) return fail('RESPONSE_TOO_LARGE');
        if (timedOut) return fail('TIMEOUT');
        return fail('NETWORK_FAILURE');
      } finally {
        if (stop !== undefined) clearTimeout(stop);
      }
    },
  });
}
