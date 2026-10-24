import { resolveProductionPortOneVerifiedAgeModeV1 } from './portone-v2-age-enforcement-activation-v1.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';

/**
 * Initial account registration has no canonical, server-verified Subject yet.
 * Until a pre-registration PortOne binding is implemented, ENFORCE denies
 * registration rather than trusting a browser-supplied birth date or checkbox.
 * Existing session login and privacy rights remain reachable.
 */
export const PORTONE_UNVERIFIED_IDENTITY_ADMISSION_V1 = Object.freeze({
  surfaces: ['member-sign-up', 'social-start', 'social-complete', 'naver-bridge', 'guest-bootstrap'],
  code: 'AGE_VERIFICATION_UNAVAILABLE',
} as const);
export type UnverifiedIdentityAdmissionSurfaceV1 =
  (typeof PORTONE_UNVERIFIED_IDENTITY_ADMISSION_V1.surfaces)[number];

export function denyUnverifiedInitialIdentityAdmissionV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  surface: UnverifiedIdentityAdmissionSurfaceV1;
}>): Response | null {
  if (resolveProductionPortOneVerifiedAgeModeV1(input.env) === 'off') return null;
  return Response.json({
    ok: false,
    error: {
      code: PORTONE_UNVERIFIED_IDENTITY_ADMISSION_V1.code,
      messageKey: 'age.verification_unavailable',
      retryable: false,
    },
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
