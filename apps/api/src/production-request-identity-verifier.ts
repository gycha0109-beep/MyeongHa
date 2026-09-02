import { createHmac } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { GuestBootstrapTokenFingerprintPortV1 } from './guest-bootstrap-command.js';
import type {
  ProductionUserDataRuntimeConfigV1,
} from './production-user-data-runtime-config.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTHORIZATION_HEADER = 'authorization' as const;
const SUPABASE_API_KEY_HEADER = 'apikey' as const;
const SUPABASE_AUTH_USER_PATH = '/auth/v1/user' as const;
const DEFAULT_TIMEOUT_MS = 5_000;
const MIN_GUEST_BEARER_LENGTH = 32;
const MAX_GUEST_BEARER_LENGTH = 512;

export const PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1 =
  'myeongha-guest-bearer-hmac-sha256-v1' as const;

export type ProductionRequestIdentityVerifierFailureCodeV1 =
  | 'SUPABASE_UNAVAILABLE'
  | 'INVALID_SUPABASE_RESPONSE';

export class ProductionRequestIdentityVerifierErrorV1 extends Error {
  constructor(
    readonly code: ProductionRequestIdentityVerifierFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ProductionRequestIdentityVerifierErrorV1';
  }
}

export interface ProductionRequestIdentityFetchResponseV1 {
  readonly status: number;
  readonly headers: Readonly<{ get(name: string): string | null }>;
  text(): Promise<string>;
}

export interface ProductionRequestIdentityFetchInitV1 {
  readonly method: 'GET';
  readonly headers: Readonly<Record<string, string>>;
  readonly redirect: 'manual';
  readonly signal: AbortSignal;
}

export type ProductionRequestIdentityFetchV1 = (
  url: string,
  init: ProductionRequestIdentityFetchInitV1,
) => Promise<ProductionRequestIdentityFetchResponseV1>;

export interface CreateProductionRequestIdentityVerifierInputV1 {
  readonly config: ProductionUserDataRuntimeConfigV1;
  readonly fetchImpl?: ProductionRequestIdentityFetchV1;
  readonly timeoutMs?: number;
}

function defaultFetch(
  url: string,
  init: ProductionRequestIdentityFetchInitV1,
): Promise<ProductionRequestIdentityFetchResponseV1> {
  return fetch(url, init);
}

function requireTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 100 || value > 30_000) {
    throw new Error('Production identity verifier timeout is outside supported bounds.');
  }
  return value;
}

function parseBearerToken(request: Request): string | null {
  const authorization = request.headers.get(AUTHORIZATION_HEADER);
  if (authorization === null) return null;

  const match = /^Bearer ([^\s,]+)$/iu.exec(authorization.trim());
  if (match === null) return null;

  const token = match[1];
  return token === undefined || token.length === 0 ? null : token;
}

function looksLikeJwt(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token);
}

function isSupportedGuestBearer(token: string): boolean {
  if (token.length < MIN_GUEST_BEARER_LENGTH || token.length > MAX_GUEST_BEARER_LENGTH) {
    return false;
  }
  return /^[\x21-\x7E]+$/u.test(token) && !token.includes(',');
}

export function fingerprintProductionGuestBearerTokenV1(input: {
  readonly rawBearerToken: string;
  readonly secret: string;
}): string {
  if (!isSupportedGuestBearer(input.rawBearerToken) || looksLikeJwt(input.rawBearerToken)) {
    throw new Error('Guest bearer token is outside the production V1 transport contract.');
  }
  if (input.secret.length < 32) {
    throw new Error('Guest fingerprint secret is outside the production minimum.');
  }

  const digest = createHmac('sha256', input.secret)
    .update(`${PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1}\0`, 'utf8')
    .update(input.rawBearerToken, 'utf8')
    .digest('hex');
  return `${PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1}:${digest}`;
}

export function createProductionGuestBearerTokenFingerprintPortV1(
  config: ProductionUserDataRuntimeConfigV1,
): GuestBootstrapTokenFingerprintPortV1 {
  return Object.freeze({
    fingerprintGuestBearerToken({ rawBearerToken }) {
      return fingerprintProductionGuestBearerTokenV1({
        rawBearerToken,
        secret: config.guestFingerprintSecret,
      });
    },
  });
}

function supabaseUserEndpoint(config: ProductionUserDataRuntimeConfigV1): string {
  return `${config.supabaseOrigin}${SUPABASE_AUTH_USER_PATH}`;
}

function requireJsonContentType(response: ProductionRequestIdentityFetchResponseV1): void {
  const contentType = response.headers.get('content-type');
  if (contentType === null || !/^application\/json(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new ProductionRequestIdentityVerifierErrorV1(
      'INVALID_SUPABASE_RESPONSE',
      'Supabase Auth returned an invalid success content type.',
    );
  }
}

function requireVerifiedAuthUserId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ProductionRequestIdentityVerifierErrorV1(
      'INVALID_SUPABASE_RESPONSE',
      'Supabase Auth returned an invalid verified user payload.',
    );
  }
  const id = (payload as Record<string, unknown>).id;
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
  ) {
    throw new ProductionRequestIdentityVerifierErrorV1(
      'INVALID_SUPABASE_RESPONSE',
      'Supabase Auth returned an invalid verified user identity.',
    );
  }
  return id;
}

async function verifySupabaseMember(input: {
  readonly token: string;
  readonly config: ProductionUserDataRuntimeConfigV1;
  readonly fetchImpl: ProductionRequestIdentityFetchV1;
  readonly timeoutMs: number;
}): Promise<VerifiedSubjectIdentityEvidenceV1 | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  let response: ProductionRequestIdentityFetchResponseV1;
  try {
    response = await input.fetchImpl(supabaseUserEndpoint(input.config), {
      method: 'GET',
      headers: Object.freeze({
        [SUPABASE_API_KEY_HEADER]: input.config.supabaseApiKey,
        [AUTHORIZATION_HEADER]: `Bearer ${input.token}`,
      }),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    throw new ProductionRequestIdentityVerifierErrorV1(
      'SUPABASE_UNAVAILABLE',
      'Supabase Auth identity verification is unavailable.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return null;
  }
  if (response.status !== 200) {
    throw new ProductionRequestIdentityVerifierErrorV1(
      response.status >= 500 || response.status === 429
        ? 'SUPABASE_UNAVAILABLE'
        : 'INVALID_SUPABASE_RESPONSE',
      'Supabase Auth identity verification did not return an accepted status.',
    );
  }

  requireJsonContentType(response);
  let payload: unknown;
  try {
    payload = JSON.parse(await response.text()) as unknown;
  } catch {
    throw new ProductionRequestIdentityVerifierErrorV1(
      'INVALID_SUPABASE_RESPONSE',
      'Supabase Auth returned malformed verified user JSON.',
    );
  }

  return Object.freeze({
    kind: 'member',
    verifiedAuthUserId: requireVerifiedAuthUserId(payload),
  });
}

export function createProductionRequestIdentityVerifierV1(
  input: CreateProductionRequestIdentityVerifierInputV1,
): IdentityEvidenceVerificationPortV1 {
  const fetchImpl = input.fetchImpl ?? defaultFetch;
  const timeoutMs = requireTimeoutMs(input.timeoutMs);
  const guestFingerprintPort = createProductionGuestBearerTokenFingerprintPortV1(
    input.config,
  );

  return Object.freeze({
    async verifyRequestIdentity(
      request: Request,
    ): Promise<VerifiedSubjectIdentityEvidenceV1 | null> {
      const token = parseBearerToken(request);
      if (token === null) return null;

      if (looksLikeJwt(token)) {
        return verifySupabaseMember({
          token,
          config: input.config,
          fetchImpl,
          timeoutMs,
        });
      }

      if (!isSupportedGuestBearer(token)) return null;
      const verifiedGuestTokenHash =
        await guestFingerprintPort.fingerprintGuestBearerToken({ rawBearerToken: token });
      return Object.freeze({
        kind: 'guest',
        verifiedGuestTokenHash,
      });
    },
  });
}
