import {
  PORTONE_V2_IDENTITY_VERIFICATION_LAUNCH_HOLD_V1,
  assessPortOneV2IdentityVerificationV1,
  type PortOneV2IdentityOwnedAttemptV1,
  type PortOneV2IdentityVerificationDecisionV1,
} from './portone-v2-identity-verification-contract-v1.js';

/**
 * Server-only read adapter; no HTTP route, browser SDK, secret discovery,
 * persistence or production activation is supplied by this module.
 * The caller must atomically consume the owned attempt before persisting age authority.
 */
export const PORTONE_V2_IDENTITY_LOOKUP_DEFAULT_TIMEOUT_MS_V1 = 5_000;
export const PORTONE_V2_IDENTITY_LOOKUP_MAX_TIMEOUT_MS_V1 = 30_000;
export const PORTONE_V2_IDENTITY_LOOKUP_MAX_RESPONSE_BYTES_V1 = 16_384;

export type PortOneV2IdentityLookupFailureCodeV1 =
  | 'INVALID_CONFIGURATION' | 'INVALID_REQUEST' | 'TIMEOUT'
  | 'NETWORK_FAILURE' | 'HTTP_FAILURE' | 'INVALID_RESPONSE'
  | 'RESPONSE_TOO_LARGE';

export class PortOneV2IdentityLookupErrorV1 extends Error {
  constructor(
    readonly code: PortOneV2IdentityLookupFailureCodeV1,
    readonly httpStatus: number | null = null,
  ) {
    super('PortOne V2 identity lookup rejected: ' + code + '.');
    this.name = 'PortOneV2IdentityLookupErrorV1';
  }
}

export type PortOneV2IdentityHttpFetchV1 = (url: string, init: RequestInit) => Promise<Response>;
export interface PortOneV2IdentityLookupConfigV1 {
  readonly apiSecret: string;
  readonly fetchImpl?: PortOneV2IdentityHttpFetchV1;
  readonly timeoutMs?: number;
}
export interface PortOneV2IdentityLookupRequestV1 {
  readonly subjectId: string;
  readonly identityVerificationId: string;
  readonly ownedAttempt: PortOneV2IdentityOwnedAttemptV1;
  readonly serverTime: string;
}
export interface PortOneV2IdentityLookupAdapterV1 {
  verify(input: PortOneV2IdentityLookupRequestV1): Promise<PortOneV2IdentityVerificationDecisionV1>;
}

function validateSecret(value: string): string {
  if (
    typeof value !== 'string' || value.length < 1 ||
    value.length > 4_096 || value.trim() !== value || /[\r\n]/u.test(value)
  ) {
    throw new PortOneV2IdentityLookupErrorV1('INVALID_CONFIGURATION');
  }
  return value;
}

function validateTimeout(value: number | undefined): number {
  const timeout = value ?? PORTONE_V2_IDENTITY_LOOKUP_DEFAULT_TIMEOUT_MS_V1;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > PORTONE_V2_IDENTITY_LOOKUP_MAX_TIMEOUT_MS_V1) {
    throw new PortOneV2IdentityLookupErrorV1('INVALID_CONFIGURATION');
  }
  return timeout;
}

function validId(value: string): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
}

async function readBoundedJsonResponse(response: Response): Promise<unknown> {
  if (response.status !== 200) {
    throw new PortOneV2IdentityLookupErrorV1('HTTP_FAILURE', response.status);
  }
  const type = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(type)) {
    throw new PortOneV2IdentityLookupErrorV1('INVALID_RESPONSE');
  }
  const declaredSize = response.headers.get('content-length');
  if (declaredSize !== null) {
    if (!/^\d+$/u.test(declaredSize)) {
      throw new PortOneV2IdentityLookupErrorV1('INVALID_RESPONSE');
    }
    if (Number(declaredSize) > PORTONE_V2_IDENTITY_LOOKUP_MAX_RESPONSE_BYTES_V1) {
      throw new PortOneV2IdentityLookupErrorV1('RESPONSE_TOO_LARGE');
    }
  }
  if (response.body === null) {
    throw new PortOneV2IdentityLookupErrorV1('INVALID_RESPONSE');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > PORTONE_V2_IDENTITY_LOOKUP_MAX_RESPONSE_BYTES_V1) {
        throw new PortOneV2IdentityLookupErrorV1('RESPONSE_TOO_LARGE');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new PortOneV2IdentityLookupErrorV1('INVALID_RESPONSE');
  }
}

async function withDeadline<T>(
  durationMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PortOneV2IdentityLookupErrorV1('TIMEOUT'));
    }, durationMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Factory is inert: no network request occurs until verify() is called by a
 * future authenticated server route after the one-time attempt is issued.
 */
export function createPortOneV2IdentityLookupAdapterV1(
  config: PortOneV2IdentityLookupConfigV1,
): PortOneV2IdentityLookupAdapterV1 {
  if (typeof config !== 'object' || config === null) {
    throw new PortOneV2IdentityLookupErrorV1('INVALID_CONFIGURATION');
  }
  const apiSecret = validateSecret(config.apiSecret);
  const timeoutMs = validateTimeout(config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? fetch;

  return Object.freeze({
    async verify(input: PortOneV2IdentityLookupRequestV1): Promise<PortOneV2IdentityVerificationDecisionV1> {
      if (
        !input || !validId(input.identityVerificationId) ||
        typeof input.subjectId !== 'string' || !input.subjectId ||
        !input.ownedAttempt ||
        input.ownedAttempt.subjectId !== input.subjectId ||
        input.ownedAttempt.identityVerificationId !== input.identityVerificationId ||
        input.ownedAttempt.status !== 'pending'
      ) {
        throw new PortOneV2IdentityLookupErrorV1('INVALID_REQUEST');
      }
      const url = PORTONE_V2_IDENTITY_VERIFICATION_LAUNCH_HOLD_V1.identityApiOrigin +
        '/identity-verifications/' + encodeURIComponent(input.identityVerificationId);
      let providerResult: unknown;
      try {
        providerResult = await withDeadline(timeoutMs, async signal => {
          const response = await fetchImpl(url, {
            method: 'GET',
            headers: { Authorization: 'PortOne ' + apiSecret, Accept: 'application/json' },
            redirect: 'error',
            cache: 'no-store',
            signal,
          });
          return await readBoundedJsonResponse(response);
        });
      } catch (error) {
        if (error instanceof PortOneV2IdentityLookupErrorV1) throw error;
        throw new PortOneV2IdentityLookupErrorV1('NETWORK_FAILURE');
      }
      // Never return the original provider object containing personal data.
      return assessPortOneV2IdentityVerificationV1({
        subjectId: input.subjectId,
        expectedIdentityVerificationId: input.identityVerificationId,
        ownedAttempt: input.ownedAttempt,
        providerResult,
        serverTime: input.serverTime,
      });
    },
  });
}
