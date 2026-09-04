import { handleCurrentSubjectBirthProfileRequestV1 } from './current-subject-birth-profile-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionCurrentSubjectBirthProfileRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionCurrentSubjectBirthProfileRuntimeV1 {
  handleRequest(input: ProductionCurrentSubjectBirthProfileRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionCurrentSubjectBirthProfileRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

export function createProductionCurrentSubjectBirthProfileRuntimeV1(
  input: CreateProductionCurrentSubjectBirthProfileRuntimeInputV1,
): ProductionCurrentSubjectBirthProfileRuntimeV1 {
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(config);
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionCurrentSubjectBirthProfileRequestV1) {
      return handleCurrentSubjectBirthProfileRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool,
      });
    },
    close() {
      return pool.close();
    },
  });
}
