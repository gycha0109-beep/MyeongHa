import { createHmac } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { GuestBootstrapTokenFingerprintPortV1 } from './guest-bootstrap-command.js';
import type { ProductionUserDataRuntimeConfigV1 } from './production-user-data-runtime-config.js';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
  type SupabaseMemberVerifierFetchV1,
} from './supabase-member-identity-verifier.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTHORIZATION_HEADER = 'authorization' as const;
const MIN_GUEST_BEARER_LENGTH = 32;
const MAX_GUEST_BEARER_LENGTH = 512;

export const PRODUCTION_GUEST_BEARER_FINGERPRINT_VERSION_V1 =
  'myeongha-guest-bearer-hmac-sha256-v1' as const;

export interface CreateProductionRequestIdentityVerifierInputV1 {
  readonly config: ProductionUserDataRuntimeConfigV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

function readBearerCredential(request: Request): string | null {
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
    fingerprintGuestBearerToken({
      rawBearerToken,
    }: {
      readonly rawBearerToken: string;
    }) {
      return fingerprintProductionGuestBearerTokenV1({
        rawBearerToken,
        secret: config.guestFingerprintSecret,
      });
    },
  });
}

/**
 * Production Shared API identity verifier.
 *
 * JWT-shaped bearer credentials are delegated exclusively to the already-authoritative
 * Supabase Member verifier. Supported non-JWT opaque bearers are treated exclusively as
 * Guest credentials and converted locally to the versioned HMAC fingerprint expected by
 * the Guest subject resolver. A rejected Member credential never falls through to Guest.
 */
export function createProductionRequestIdentityVerifierV1(
  input: CreateProductionRequestIdentityVerifierInputV1,
): IdentityEvidenceVerificationPortV1 {
  const memberVerifier = new SupabaseMemberIdentityEvidenceVerifierV1({
    supabaseOrigin: input.config.supabaseOrigin,
    supabaseApiKey: input.config.supabaseApiKey,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { fetchImpl: input.memberFetchImpl }),
  });
  const guestFingerprintPort = createProductionGuestBearerTokenFingerprintPortV1(
    input.config,
  );

  return Object.freeze({
    async verifyRequestIdentity(
      request: Request,
    ): Promise<VerifiedSubjectIdentityEvidenceV1 | null> {
      const token = readBearerCredential(request);
      if (token === null) return null;

      if (looksLikeJwt(token)) {
        return memberVerifier.verifyRequestIdentity(request);
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
