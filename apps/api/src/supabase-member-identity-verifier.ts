import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTHORIZATION_HEADER = 'authorization';
const API_KEY_HEADER = 'apikey';
const ACCEPT_HEADER = 'accept';
const JSON_MEDIA_TYPE = 'application/json';
const AUTH_USER_PATH = '/auth/v1/user';

export const SUPABASE_MEMBER_IDENTITY_VERIFIER_BINDINGS_V1 = Object.freeze({
  authorizationScheme: 'Bearer',
  authUserPath: AUTH_USER_PATH,
} as const);

export type SupabaseMemberVerifierFetchV1 = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SupabaseMemberIdentityVerifierOptionsV1 {
  readonly supabaseOrigin: string;
  readonly supabaseApiKey: string;
  readonly fetchImpl?: SupabaseMemberVerifierFetchV1;
}

export class SupabaseMemberIdentityVerifierErrorV1 extends Error {
  readonly code:
    | 'SUPABASE_MEMBER_VERIFIER_CONFIG_INVALID'
    | 'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED'
    | 'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID';

  constructor(
    code: SupabaseMemberIdentityVerifierErrorV1['code'],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SupabaseMemberIdentityVerifierErrorV1';
    this.code = code;
  }
}

function requireHttpsOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SupabaseMemberIdentityVerifierErrorV1(
      'SUPABASE_MEMBER_VERIFIER_CONFIG_INVALID',
      'Supabase Member verifier origin is missing.',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SupabaseMemberIdentityVerifierErrorV1(
      'SUPABASE_MEMBER_VERIFIER_CONFIG_INVALID',
      'Supabase Member verifier origin is invalid.',
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new SupabaseMemberIdentityVerifierErrorV1(
      'SUPABASE_MEMBER_VERIFIER_CONFIG_INVALID',
      'Supabase Member verifier origin must be a bare HTTPS origin.',
    );
  }

  return url.origin;
}

function requireApiKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 20) {
    throw new SupabaseMemberIdentityVerifierErrorV1(
      'SUPABASE_MEMBER_VERIFIER_CONFIG_INVALID',
      'Supabase Member verifier API key is missing or invalid.',
    );
  }
  return value.trim();
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get(AUTHORIZATION_HEADER);
  if (authorization === null) return null;

  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (match === null) return null;

  const token = match[1];
  return token === undefined || token.length === 0 ? null : token;
}

function requireUserId(payload: unknown): string {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new SupabaseMemberIdentityVerifierErrorV1(
      'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
      'Supabase Auth returned an invalid user response.',
    );
  }

  const id = (payload as { id?: unknown }).id;
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
  ) {
    throw new SupabaseMemberIdentityVerifierErrorV1(
      'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
      'Supabase Auth returned an invalid user id.',
    );
  }

  return id;
}

export class SupabaseMemberIdentityEvidenceVerifierV1
  implements IdentityEvidenceVerificationPortV1
{
  private readonly authUserUrl: string;
  private readonly supabaseApiKey: string;
  private readonly fetchImpl: SupabaseMemberVerifierFetchV1;

  constructor(options: SupabaseMemberIdentityVerifierOptionsV1) {
    const origin = requireHttpsOrigin(options.supabaseOrigin);
    this.authUserUrl = `${origin}${AUTH_USER_PATH}`;
    this.supabaseApiKey = requireApiKey(options.supabaseApiKey);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;

    if (typeof this.fetchImpl !== 'function') {
      throw new SupabaseMemberIdentityVerifierErrorV1(
        'SUPABASE_MEMBER_VERIFIER_CONFIG_INVALID',
        'Supabase Member verifier fetch implementation is unavailable.',
      );
    }
  }

  async verifyRequestIdentity(
    request: Request,
  ): Promise<VerifiedSubjectIdentityEvidenceV1 | null> {
    const token = readBearerToken(request);
    if (token === null) return null;

    let response: Response;
    try {
      response = await this.fetchImpl(this.authUserUrl, {
        method: 'GET',
        headers: {
          [ACCEPT_HEADER]: JSON_MEDIA_TYPE,
          [API_KEY_HEADER]: this.supabaseApiKey,
          [AUTHORIZATION_HEADER]: `Bearer ${token}`,
        },
        cache: 'no-store',
      });
    } catch (error) {
      throw new SupabaseMemberIdentityVerifierErrorV1(
        'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED',
        'Supabase Auth user verification request failed.',
        { cause: error },
      );
    }

    if (response.status === 401 || response.status === 403) {
      return null;
    }

    if (!response.ok) {
      throw new SupabaseMemberIdentityVerifierErrorV1(
        'SUPABASE_MEMBER_VERIFIER_UPSTREAM_FAILED',
        `Supabase Auth user verification failed with status ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new SupabaseMemberIdentityVerifierErrorV1(
        'SUPABASE_MEMBER_VERIFIER_RESPONSE_INVALID',
        'Supabase Auth returned invalid JSON.',
        { cause: error },
      );
    }

    return Object.freeze({
      kind: 'member',
      verifiedAuthUserId: requireUserId(payload),
    });
  }
}
