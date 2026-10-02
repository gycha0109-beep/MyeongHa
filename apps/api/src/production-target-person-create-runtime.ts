import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionBirthInputFingerprintPortV1 } from './production-birth-input-fingerprint.js';
import { parseProductionBirthProfileCreateRuntimeConfigV1 } from './production-birth-profile-create-runtime-config.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';
import { handleTargetPersonCreateRequestV1 } from './target-person-create-http.js';

export interface ProductionTargetPersonCreateRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionTargetPersonCreateRuntimeV1 {
  handleRequest(input: ProductionTargetPersonCreateRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionTargetPersonCreateRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

export function createProductionTargetPersonCreateRuntimeV1(
  input: CreateProductionTargetPersonCreateRuntimeInputV1,
): ProductionTargetPersonCreateRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const createConfig = parseProductionBirthProfileCreateRuntimeConfigV1(input.env);
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: userDataConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config: userDataConfig,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });
  const fingerprintPort = createProductionBirthInputFingerprintPortV1(
    createConfig.birthInputHmacK1Secret,
  );
  const idPort = Object.freeze({
    nextTargetPersonId: randomUUID,
    nextBirthProfileId: randomUUID,
    nextBirthRevisionId: randomUUID,
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionTargetPersonCreateRequestV1) {
      return handleTargetPersonCreateRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        idPort,
        fingerprintPort,
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
