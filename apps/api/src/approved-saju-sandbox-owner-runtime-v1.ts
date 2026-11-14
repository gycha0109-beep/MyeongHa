import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import { createApprovedSajuSandboxHttpRuntimeV1 } from './approved-saju-sandbox-http-runtime-v1.js';
import { createApprovedSajuSandboxLoopbackHostV1 } from './approved-saju-sandbox-loopback-host-v1.js';
import { createProductionTargetPersonReadRuntimeV1 } from './production-target-person-read-runtime.js';
import { createProductionReadingHistoryReadRuntimeV1 } from './production-records-read-runtime.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

/**
 * Assemble the ALREADY APPROVED sandbox APIs on one isolated localhost origin:
 * owner checkout, consented counterpart reads, purchased signed Reading archive.
 *
 * This is an injection-only runtime. No environment-variable lookup, public
 * Cloudflare route, live payment activation, issuer worker or database migration.
 * The caller MUST supply two distinct, separately authorized PostgreSQL pools
 * and the existing server-side PortOne TEST verifier.
 */
export function createApprovedSajuSandboxOwnerRuntimeV1(input: Readonly<{
  origin: string;
  staticRoot: string;
  env: ProductionUserDataRuntimeEnvV1;
  channel: Readonly<{ environment: 'sandbox'; storeId: string; channelKey: string }>;
  memberPool: PostgresSubjectPoolV1;
  commercePool: PostgresSubjectPoolV1;
  verificationAdapter: CommercePaymentVerificationAdapterV1;
  memberFetchImpl?: SupabaseMemberVerifierFetchV1;
}>) {
  if (input.memberPool === input.commercePool) {
    throw new Error('Saju sandbox owner runtime requires separate member and commerce DB roles.');
  }
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const memberAuth = createProductionRequestIdentityVerifierV1({
    config,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  });
  const checkout = createApprovedSajuSandboxHttpRuntimeV1({
    origin: input.origin, channel: input.channel,
    pool: input.memberPool, commercePool: input.commercePool,
    identityEvidenceVerifier: memberAuth,
    verificationAdapter: input.verificationAdapter,
  });
  const readerOptions = {
    env: input.env, pool: input.memberPool,
    ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
  };
  const targets = createProductionTargetPersonReadRuntimeV1(readerOptions);
  const archive = createProductionReadingHistoryReadRuntimeV1({
    ...readerOptions, approvedSajuArchiveEnabled: true,
  });
  const host = createApprovedSajuSandboxLoopbackHostV1({
    origin: input.origin,
    staticRoot: input.staticRoot,
    runtime: checkout,
    ownerReads: {
      targets: request => targets.handleRequest({
        request, requestId: randomUUID(), serverTime: new Date().toISOString(),
      }),
      readings: request => archive.handleRequest({
        request, requestId: randomUUID(), serverTime: new Date().toISOString(),
      }),
    },
  });
  return Object.freeze({
    start: () => host.start(),
    async close() {
      await host.close();
      await Promise.all([targets.close(), archive.close()]);
    },
  });
}
