import { randomUUID } from 'node:crypto';
import { handleBirthProfileCreateRequestV1 } from './birth-profile-create-http.js';
import { createNodePostgresSubjectPoolV1 } from './node-postgres-subject-pool.js';
import { createProductionBirthInputFingerprintPortV1 } from './production-birth-input-fingerprint.js';
import { parseProductionBirthProfileCreateRuntimeConfigV1 } from './production-birth-profile-create-runtime-config.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionBirthProfileCreateRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionBirthProfileCreateRuntimeV1 {
  handleRequest(input: ProductionBirthProfileCreateRequestV1): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionBirthProfileCreateRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Server-side test/runtime injection only. Never derived from the client request. */
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}

/**
 * Production composition root for the Birth Profile create foundation.
 *
 * This creates runtime dependencies only. A separate reviewed Vercel route adapter is
 * still required before POST /api/birth-profiles becomes publicly reachable.
 */
export function createProductionBirthProfileCreateRuntimeV1(
  input: CreateProductionBirthProfileCreateRuntimeInputV1,
): ProductionBirthProfileCreateRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const createConfig = parseProductionBirthProfileCreateRuntimeConfigV1(input.env);
  const pool = createNodePostgresSubjectPoolV1(userDataConfig);
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
    nextBirthProfileId: randomUUID,
    nextBirthRevisionId: randomUUID,
  });

  return Object.freeze({
    handleRequest(requestInput: ProductionBirthProfileCreateRequestV1) {
      return handleBirthProfileCreateRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool,
        idPort,
        fingerprintPort,
      });
    },
    close() {
      return pool.close();
    },
  });
}
