// Watchtower-Track: security
// Production configuration composition for UC-07 server decision boundary.
// The existing public API/Worker route does NOT mount this while G0/G3/G6 HOLD.
import {
  handleSeyeonPlannerMemoryDecisionRequestV1,
  type HandleSeyeonPlannerMemoryDecisionInputV1,
} from './seyeon-planner-memory-decision-http-v1.js';
import { readSeyeonPendingPlannerMemoryDecisionSourceV1 } from './postgres-seyeon-planner-memory-decision-source-v1.js';
import { commitSeyeonPlannerMemoryDecisionS0V1 } from './seyeon-planner-memory-decision-commit-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export const SEYEON_PLANNER_MEMORY_DECISION_PRODUCTION_RUNTIME_V1 = Object.freeze({
  publicRouteMounted:false,
  defaultDecisionWriteAdmission:'DENY',
  source: 'db_verified_dialogue_planner',
  currentScope: 'one_seyeon_original_memory',
} as const);

export interface CreateProductionSeyeonPlannerMemoryDecisionInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Must be reviewed server-owned DB/transport approval. Not from env. */
  readonly approvedDecisionWrites?: HandleSeyeonPlannerMemoryDecisionInputV1['approvedDecisionWrites'];
  /** The approved DB owner source reader must hold its row lock until commit. */
  readonly loadVerifiedPlannerSource?: HandleSeyeonPlannerMemoryDecisionInputV1['loadVerifiedPlannerSource'];
  /** Actual atomic DB effect; may use existing S0 one-Memory accept + grant. */
  readonly commitDecision?: HandleSeyeonPlannerMemoryDecisionInputV1['commitDecision'];
}

export function createProductionSeyeonPlannerMemoryDecisionRuntimeV1(
  input: CreateProductionSeyeonPlannerMemoryDecisionInputV1,
) {
  const config=parseProductionUserDataRuntimeConfigV1(input.env);
  const lease=createProductionPostgresSubjectPoolLeaseV1({
    config,...(input.pool===undefined?{}:{pool:input.pool}),
  });
  const identityEvidenceVerifier=createProductionRequestIdentityVerifierV1({
    config,...(input.memberFetchImpl===undefined?{}:{memberFetchImpl:input.memberFetchImpl}),
  });

  return Object.freeze({
    handleRequest(requestInput:Readonly<{
      request:Request;requestId:string;serverTime:string;
    }>):Promise<Response>{
      return handleSeyeonPlannerMemoryDecisionRequestV1({
        ...requestInput,pool:lease.pool,identityEvidenceVerifier,
        ...(input.approvedDecisionWrites===undefined?{}:{
          approvedDecisionWrites:input.approvedDecisionWrites,
        }),
        loadVerifiedPlannerSource:input.loadVerifiedPlannerSource ??
          readSeyeonPendingPlannerMemoryDecisionSourceV1,
        commitDecision:input.commitDecision ?? commitSeyeonPlannerMemoryDecisionS0V1,
      });
    },
    close(){return lease.close();},
  });
}
