import {
  handleMemberChatCreditWalletCandidateV1,
} from './commerce-chat-credit-wallet-http-candidate-v1.js';
import {createProductionPostgresSubjectPoolLeaseV1} from './production-postgres-subject-pool-lease.js';
import {createProductionRequestIdentityVerifierV1} from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {SupabaseMemberVerifierFetchV1} from './supabase-member-identity-verifier.js';

export const PRODUCTION_CHAT_CREDIT_WALLET_V1 = Object.freeze({
  route: '/api/me/credits',
  method: 'GET',
  signupGrantCredits: 50,
  signupValidDays: 30,
  paidTopUpEnabled: false,
  paidReadingRewardEnabled: false,
  chatDebitEnabled: false,
} as const);

export function createProductionChatCreditWalletRuntimeV1(input: Readonly<{
  env: ProductionUserDataRuntimeEnvV1;
  pool?: PostgresSubjectPoolV1;
  memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}>) {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool===undefined?{}:{pool:input.pool}),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl===undefined?{}:{memberFetchImpl:input.memberFetchImpl}),
  });
  return Object.freeze({
    handleRequest(input: Readonly<{
      request: Request;
      requestId: string;
      serverTime: string;
    }>) {
      return handleMemberChatCreditWalletCandidateV1({
        ...input,
        identityEvidenceVerifier,
        pool:poolLease.pool,
      });
    },
    close(){return poolLease.close();},
  });
}
