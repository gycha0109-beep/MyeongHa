import { randomUUID } from 'node:crypto';
import { handleDeviceInstallationRequestV1 } from './device-installation-http.js';
import { parseProductionDeviceInstallationRuntimeConfigV1 } from './device-installation-runtime-config.js';
import { createProductionDeviceInstallationTokenProtectionPortV1 } from './device-installation-token-protection.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export interface ProductionDeviceInstallationRuntimeV1 {
  handleRequest(input: {
    readonly request: Request;
    readonly requestId: string;
    readonly serverTime: string;
  }): Promise<Response>;
  close(): Promise<void>;
}

export function createProductionDeviceInstallationRuntimeV1(input: {
  readonly env: ProductionUserDataRuntimeEnvV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}): ProductionDeviceInstallationRuntimeV1 {
  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);
  const deviceConfig =
    parseProductionDeviceInstallationRuntimeConfigV1(input.env);
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
  const tokenProtectionPort =
    createProductionDeviceInstallationTokenProtectionPortV1({
      encryptionSecret: deviceConfig.pushTokenEncryptionK1Secret,
      fingerprintSecret: deviceConfig.pushTokenFingerprintK1Secret,
    });

  return Object.freeze({
    handleRequest(requestInput) {
      return handleDeviceInstallationRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        idPort: Object.freeze({ nextInstallationId: randomUUID }),
        tokenProtectionPort,
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
