import { createAdminSupabaseOwnerAuthV1 } from './admin-auth-v1.js';
import { createAdminReadHttpHandlerV1 } from './admin-read-http-v1.js';
import { createAdminPostgresReadPortV1 } from './admin-postgres-read-v1.js';
import { createAdminPostgresAuditPortV1 } from './admin-audit-postgres-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';

export interface AdminPrivateRuntimeEnvV1 {
  readonly MYEONGHA_ADMIN_PRIVATE_ENABLED?: string;
  readonly MYEONGHA_ADMIN_OWNER_AUTH_USER_ID?: string;
  readonly MYEONGHA_ADMIN_SUPABASE_ORIGIN?: string;
  readonly MYEONGHA_SUPABASE_API_KEY?: string;
}
export interface CreateAdminPrivateRuntimeInputV1 {
  readonly env: AdminPrivateRuntimeEnvV1;
  readonly readPool: PostgresSubjectPoolV1;
  readonly auditPool: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class AdminPrivateRuntimeUnavailableV1 extends Error {
  constructor() {
    super('Privileged administrator runtime is not approved or configured.');
    this.name = 'AdminPrivateRuntimeUnavailableV1';
  }
}

// Not imported or mounted by the public API. A separate private hosting,
// deployment and least-privilege database authorization gate is mandatory.
export function createAdminPrivateRuntimeV1(input: CreateAdminPrivateRuntimeInputV1) {
  const env = input.env;
  if (env.MYEONGHA_ADMIN_PRIVATE_ENABLED !== 'true' ||
      typeof env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID !== 'string' ||
      !UUID.test(env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID) ||
      env.MYEONGHA_ADMIN_SUPABASE_ORIGIN !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN ||
      typeof env.MYEONGHA_SUPABASE_API_KEY !== 'string' ||
      env.MYEONGHA_SUPABASE_API_KEY.trim().length < 20) {
    throw new AdminPrivateRuntimeUnavailableV1();
  }
  const auth = createAdminSupabaseOwnerAuthV1({
    ownerAuthUserId: env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID,
    supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
    supabaseApiKey: env.MYEONGHA_SUPABASE_API_KEY,
    ...(input.memberFetchImpl === undefined ? {} : { fetchImpl: input.memberFetchImpl }),
  });
  const reads = createAdminPostgresReadPortV1({ pool: input.readPool });
  const audit = createAdminPostgresAuditPortV1({ pool: input.auditPool });
  return Object.freeze({
    handleRequest: createAdminReadHttpHandlerV1({ auth, reads, audit }),
  });
}
