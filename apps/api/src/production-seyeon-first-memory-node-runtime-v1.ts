// Watchtower-Track: security
// Complete server composition for the initial one-original-Memory scope.
// No public route, deployment flag, schema registration or paid activation.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import { createProductionSeyeonChatRuntimeV1 } from './production-seyeon-chat-runtime-v1.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type {SeyeonGovernedPostgresSubjectPoolV1} from './seyeon-governed-postgres-pool-v1.js';
import type {SeyeonAiGovernorAdmissionV1} from './postgres-seyeon-ai-cost-ledger-v1.js';
import { parseSeyeonGovernedDbConfigV1 } from './seyeon-governed-postgres-pool-v1.js';
import {
  createSeyeonProductionChatGovernorsV1,
  type SeyeonProductionChatGovernorApprovalV1,
} from './seyeon-production-governor-factory-v1.js';
import {
  resolveProductionSeyeonProviderConfigAtRequestV1,
  resolveProductionSeyeonRoleProviderConfigsV1,
} from './production-seyeon-turn-send-runtime-v1.js';
import { handleSeyeonFirstPositiveMemoryDirectNodeHttpV1 } from './seyeon-first-positive-memory-node-http-ingress-v1.js';
import { SEYEON_SECURITY_S0_PRODUCTION_V1 } from './seyeon-security-s0-production-policy-v1.js';
import { admitSeyeonG4FirstMemoryCreditsV1 } from './seyeon-g4-first-memory-credit-admission-v1.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  /** G4 private Commerce pool is independent of the ordinary Member DB role. */
  readonly privateCreditPool?: PostgresSubjectPoolV1;
  readonly governedCostPool?: SeyeonGovernedPostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Reviewed server policy only, never headers, JSON, env flags or model text. */
  readonly approvedPersonalRecordModelUse?: () => boolean | Promise<boolean>;
  readonly governorApproval?: SeyeonProductionChatGovernorApprovalV1;
  /** Server-approved certified GLM reservation policy. Never derived from client/env flag. */
  readonly glmRendererGovernor?: SeyeonAiGovernorAdmissionV1;
  /** Explicit server-approved first-turn zero-source path. */
  readonly zeroSourceFirstReplyApproved?: true;
}

/**
 * Auth/body → exact G1/G2/G3 readiness → owner approval → enforced Governor
 * → existing server source/Pin/model/Commit → locked original DB read/send.
 * Credentials are resolved inside a request and never cached across users.
 * This composes the implementation without authorizing its deployment.
 */
export function createProductionSeyeonFirstMemoryExecutionV1(
  input: CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1,
) {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const lease = createProductionPostgresSubjectPoolLeaseV1({
    config, ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const verifier = createProductionRequestIdentityVerifierV1({
    config, ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  return Object.freeze({
    pool: lease.pool, identityEvidenceVerifier: verifier,
    runtime: {
    async run(turn: Parameters<ReturnType<typeof createProductionSeyeonChatRuntimeV1>['run']>[0]) {
      if (input.approvedPersonalRecordModelUse === undefined ||
          (await input.approvedPersonalRecordModelUse()) !== true ||
          input.governorApproval === undefined) {
        throw Error('First Memory runtime requires reviewed source and cost authority.');
      }
      // No paid Memory inference may start on provider credentials alone.
      // Until delivery ACK can settle/release the same atomic reservation,
      // the server-owned G4 production gate is deliberately closed.
      if (!SEYEON_SECURITY_S0_PRODUCTION_V1.creditBilling.productionMounted) {
        throw Error('First Memory G4 credits and delivery settlement are not mounted.');
      }
      if (input.privateCreditPool === undefined) {
        throw Error('First Memory G4 private credit authority is not configured.');
      }
      await admitSeyeonG4FirstMemoryCreditsV1({
        pool:lease.pool,privateCreditPool:input.privateCreditPool,
        verifiedEvidence:turn.verifiedEvidence,
        threadId:turn.threadId,clientTurnId:turn.clientTurnId,
      });
      // Readiness has already succeeded before this closure can access
      // provider credentials or create any metered model implementation.
      const base = {...await resolveProductionSeyeonProviderConfigAtRequestV1(input.env),
        disablePromptCaching:true as const};
      const roles = resolveProductionSeyeonRoleProviderConfigsV1(input.env, base);
      const governors = createSeyeonProductionChatGovernorsV1({
        baseProviderConfig: base,
        ...(roles === undefined ? {} : { roleProviderConfigs: roles }),
        approval: input.governorApproval,
      });
      const governedDbConfig = input.governedCostPool===undefined?parseSeyeonGovernedDbConfigV1({
        env: input.env, ordinaryDatabaseUrl: config.databaseUrl,
        ordinaryDatabasePrincipal: config.databasePrincipal,
        rootCertificatePem: config.databaseSslRootCertificatePem ?? '',
      }):undefined;
      const glmKey = input.glmRendererGovernor === undefined ? null : input.env.OPENROUTER_API_KEY;
      if (input.glmRendererGovernor !== undefined &&
          (typeof glmKey !== 'string' || glmKey.trim().length < 20)) {
        throw Error('Approved GLM renderer requires a server OpenRouter API key.');
      }
      const runtime = createProductionSeyeonChatRuntimeV1({
        databaseConfig: config, pool: lease.pool,
        requiredPersonalRecordCount:input.zeroSourceFirstReplyApproved===true?0:1,
        providerConfig: base, roleProviderConfigs: governors.roleProviderConfigs,
        governorMode: 'ENFORCE', costGovernorForRole: governors.costGovernorForRole,
        ...(input.glmRendererGovernor === undefined ? {} : {
          glmRendererGovernor: input.glmRendererGovernor,
          glmRendererConfig: {apiKey: glmKey as string},
        }),
        ...(governedDbConfig===undefined?{}:{governedDbConfig}),
        ...(input.governedCostPool===undefined?{}:{governedCostPool:input.governedCostPool}),
        approvedPersonalRecordModelUse: input.approvedPersonalRecordModelUse,
      });
      try { return await runtime.run(turn); }
      finally { await runtime.close(); }
    },
    },
    close() { return lease.close(); },
  });
}

export function createProductionSeyeonFirstMemoryNodeRuntimeV1(
  input: CreateProductionSeyeonFirstMemoryNodeRuntimeInputV1,
) {
  const execution=createProductionSeyeonFirstMemoryExecutionV1(input);
  return Object.freeze({
    handleNodeRequest(request: Readonly<{
      incoming: IncomingMessage; response: ServerResponse;
      requestId?: string; serverTime?: string;
    }>) {
      return handleSeyeonFirstPositiveMemoryDirectNodeHttpV1({...request,
        pool:execution.pool,identityEvidenceVerifier:execution.identityEvidenceVerifier,
        runtime:execution.runtime});
    },
    close() { return execution.close(); },
  });
}
