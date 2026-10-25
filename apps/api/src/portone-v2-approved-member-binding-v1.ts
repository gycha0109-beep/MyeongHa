import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createPostgresPortOnePreenrollmentAgeAuthorityV1,
  extractPortOnePreenrollmentCookieV1,
  fingerprintPortOnePreenrollmentBindingV1,
} from './portone-v2-preenrollment-age-authority-v1.js';
import { createPostgresPortOneVerifiedAgeAdmissionPortV1 } from './portone-v2-verified-age-admission-v1.js';
import {
  fingerprintExistingMemberSocialStateV1,
  verifyExistingMemberSocialStateV1,
} from './portone-v2-existing-social-state-v1.js';
import { createPostgresExistingMemberSocialStateAuthorityV1 } from './portone-v2-existing-social-state-authority-v1.js';
import {
  issuePortOneBoundSocialStateV1,
  verifyPortOneBoundSocialStateV1,
} from './portone-v2-preenrollment-social-state-v1.js';
import { resolveProductionPortOnePreenrollmentModeV1 } from './portone-v2-preenrollment-http-runtime-v1.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';
import type { SupabasePreenrollmentMemberBindingPortV1 } from './supabase-auth-http.js';

export function createApprovedPortOnePreenrollmentMemberBindingPortV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  request: Request;
  pool: PostgresSubjectPoolV1;
  /** Social callback may check an EXISTING verified Member without a cookie. */
  allowExistingMemberOnly?: true;
}>): (SupabasePreenrollmentMemberBindingPortV1 & {
  admitExistingMember(verifiedAuthUserId: string): Promise<boolean>;
}) | null {
  // Reject partially-approved environments and cross-origin form/CSRF
  // submissions before touching any private identity or database authority.
  if (resolveProductionPortOnePreenrollmentModeV1(input.env) !== 'enforce' ||
      input.request.headers.get('origin') !== 'https://myeongha.vercel.app') return null;
  const rawNonce = extractPortOnePreenrollmentCookieV1(input.request);
  const secret = input.env.MYEONGHA_PORTONE_PREENROLLMENT_BINDING_SECRET;
  if (rawNonce === null && input.allowExistingMemberOnly !== true) return null;
  if (rawNonce !== null && typeof secret !== 'string') return null;
  const digest = rawNonce === null ? null
    : fingerprintPortOnePreenrollmentBindingV1({ rawNonce, secret: secret! });
  const authority = createPostgresPortOnePreenrollmentAgeAuthorityV1(input.pool);
  const verifiedAge = createPostgresPortOneVerifiedAgeAdmissionPortV1(input.pool);
  const existingSocial = createPostgresExistingMemberSocialStateAuthorityV1(input.pool);
  return Object.freeze({
    async readVerified() {
      return digest !== null && await authority.readVerified(digest) !== null;
    },
    issueSocialState(nowEpochMs: number) {
      if (digest === null || typeof secret !== 'string') {
        throw new Error('Social state requires verified pre-account ownership.');
      }
      return issuePortOneBoundSocialStateV1({
        secret, bindingDigest: digest, nowEpochMs,
      });
    },
    verifySocialState(state: string) {
      return digest !== null && typeof secret === 'string' &&
        verifyPortOneBoundSocialStateV1({
          secret, bindingDigest: digest, state, nowEpochMs: Date.now(),
        });
    },
    verifyExistingSocialState(state: string) {
      return input.allowExistingMemberOnly === true && rawNonce === null &&
        typeof secret === 'string' &&
        verifyExistingMemberSocialStateV1({
          secret, request: input.request, state, nowEpochMs: Date.now(),
        });
    },
    async consumeExistingSocialState(state: string) {
      if (input.allowExistingMemberOnly !== true || rawNonce !== null ||
          typeof secret !== 'string' ||
          !verifyExistingMemberSocialStateV1({
            secret, request: input.request, state, nowEpochMs: Date.now(),
          })) return false;
      return existingSocial.consume(fingerprintExistingMemberSocialStateV1({ secret, state }));
    },
    async retireExistingSocialProof() {
      // This authority is only called after an upstream verified existing
      // Member has been independently admitted. The one-use A1 SQL claim
      // prevents a second fresh account from inheriting the same age proof.
      return digest !== null && await authority.consume(digest) !== null;
    },
    async bindMember(verifiedAuthUserId: string) {
      if (digest === null) throw new Error('New Social account requires preenrollment proof.');
      await authority.bindMember(verifiedAuthUserId, digest);
    },
    async admitExistingMember(verifiedAuthUserId: string) {
      try {
        return await verifiedAge.admitFreePersonalization({
          kind: 'member', verifiedAuthUserId,
        });
      } catch {
        // No canonical Subject is an expected state for new Social accounts.
        // Any other failure is also safely denied and cannot grant access.
        return false;
      }
    },
  });
}
