import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createPostgresPortOnePreenrollmentAgeAuthorityV1,
  extractPortOnePreenrollmentCookieV1,
  fingerprintPortOnePreenrollmentBindingV1,
} from './portone-v2-preenrollment-age-authority-v1.js';
import { createPostgresPortOneVerifiedAgeAdmissionPortV1 } from './portone-v2-verified-age-admission-v1.js';
import { resolveProductionPortOnePreenrollmentModeV1 } from './portone-v2-preenrollment-http-runtime-v1.js';
import type { ProductionUserDataRuntimeEnvV1 } from './production-user-data-runtime-config.js';
import type { SupabasePreenrollmentMemberBindingPortV1 } from './supabase-auth-http.js';

export function createApprovedPortOnePreenrollmentMemberBindingPortV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  request: Request;
  pool: PostgresSubjectPoolV1;
}>): (SupabasePreenrollmentMemberBindingPortV1 & {
  admitExistingMember(verifiedAuthUserId: string): Promise<boolean>;
}) | null {
  // Reject partially-approved environments before touching a database.
  if (resolveProductionPortOnePreenrollmentModeV1(input.env) !== 'enforce') return null;
  const rawNonce = extractPortOnePreenrollmentCookieV1(input.request);
  const secret = input.env.MYEONGHA_PORTONE_PREENROLLMENT_BINDING_SECRET;
  if (rawNonce === null || typeof secret !== 'string') return null;
  const digest = fingerprintPortOnePreenrollmentBindingV1({ rawNonce, secret });
  const authority = createPostgresPortOnePreenrollmentAgeAuthorityV1(input.pool);
  const verifiedAge = createPostgresPortOneVerifiedAgeAdmissionPortV1(input.pool);
  return Object.freeze({
    async readVerified() {
      return await authority.readVerified(digest) !== null;
    },
    async bindMember(verifiedAuthUserId: string) {
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
