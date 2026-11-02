// Watchtower-Track: security
// Production-shaped but UNMOUNTED composition. A caller must explicitly
// supply source-approved write admission; no public router does so.
import {
  handleSeyeonOwnedOriginalGrantRequestV1,
} from './seyeon-owned-original-memory-grant-http-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export const SEYEON_PRODUCTION_OWNED_ORIGINAL_GRANT_RUNTIME_V1 = Object.freeze({
  version:'seyeon-production-owned-original-grant-runtime-v1',
  publicRouteMounted:false,
  writeAdmission:'DENY',
  memberIdentityVerified:true,
} as const);

export interface CreateProductionSeyeonOwnedOriginalGrantRuntimeV1Input {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Never derived from request, headers, env flag or model content. */
  readonly approvedDbWriteAdmission?: () => boolean | Promise<boolean>;
}

export function createProductionSeyeonOwnedOriginalGrantRuntimeV1(
  input: CreateProductionSeyeonOwnedOriginalGrantRuntimeV1Input,
) {
  const config=parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease=createProductionPostgresSubjectPoolLeaseV1({
    config,...(input.pool===undefined?{}:{pool:input.pool}),
  });
  const identityEvidenceVerifier=createProductionRequestIdentityVerifierV1({
    config,...(input.memberFetchImpl===undefined?{}:{memberFetchImpl:input.memberFetchImpl}),
  });

  return Object.freeze({
    handleRequest(requestInput: Readonly<{
      request: Request;requestId:string;serverTime:string;
    }>):Promise<Response> {
      return handleSeyeonOwnedOriginalGrantRequestV1({
        ...requestInput,identityEvidenceVerifier,pool:poolLease.pool,
        ...(input.approvedDbWriteAdmission===undefined?{}:{
          approvedDbWriteAdmission:input.approvedDbWriteAdmission,
        }),
      });
    },
    close(){return poolLease.close();},
  });
}
