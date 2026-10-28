import type { createAdminAnalyticsVerifiedReadingAdapterV1 } from './admin-analytics-verified-reading-v1.js';
import { handleOfficialReadingRecordRequestV1 } from './official-reading-record-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionOfficialReadingRecordRequestV1 {
  readonly request:Request;
  readonly requestId:string;
  readonly serverTime:string;
}

/** Composition for the existing owner-scoped Official Reading archive read.
 * A Vercel/public route must be explicitly mounted separately; this does not
 * enable analytics, publish Reading data, or authorize Reading execution. */
export function createProductionOfficialReadingRecordRuntimeV1(input:{
  readonly env:ProductionUserDataRuntimeEnvV1;
  readonly pool?:PostgresSubjectPoolV1;
  readonly memberFetchImpl?:SupabaseMemberVerifierFetchV1;
  /** An explicitly approved, consent-bound server analytics adapter only.
   * The adapter independently verifies stored succeeded Reading state.
   * Reopening an archive is NOT proof of full completion-event coverage. */
  readonly verifiedReadingAnalytics?:Pick<ReturnType<typeof createAdminAnalyticsVerifiedReadingAdapterV1>,'record'>;
}){
  const config=parseProductionUserDataRuntimeConfigV1(input.env);
  const identityEvidenceVerifier=createProductionRequestIdentityVerifierV1({
    config,...(input.memberFetchImpl===undefined?{}:{memberFetchImpl:input.memberFetchImpl}),
  });
  const lease=createProductionPostgresSubjectPoolLeaseV1({
    config,...(input.pool===undefined?{}:{pool:input.pool}),
  });
  return Object.freeze({
    handleRequest(req:ProductionOfficialReadingRecordRequestV1):Promise<Response>{
      return handleOfficialReadingRecordRequestV1({
        ...req,identityEvidenceVerifier,pool:lease.pool,
        ...(input.verifiedReadingAnalytics===undefined?{}:{verifiedReadingAnalytics:input.verifiedReadingAnalytics}),
      });
    },
    close():Promise<void>{return lease.close();},
  });
}
