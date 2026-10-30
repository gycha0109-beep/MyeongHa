import type { createAdminAnalyticsVerifiedPurchaseAdapterV1 } from './admin-analytics-verified-purchase-v1.js';
import {
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentVerificationAdapterConfigV1,
} from './portone-v2-payment-verification-adapter.js';
import { handlePaymentAttemptServerVerificationRequestV1 } from './payment-attempt-server-verification-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { createProductionPostgresSubjectPoolLeaseV1 } from './production-postgres-subject-pool-lease.js';
import { createProductionRequestIdentityVerifierV1 } from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';

export const PRODUCTION_PAYMENT_ATTEMPT_SERVER_VERIFICATION_RUNTIME_BINDINGS_V1 =
  Object.freeze({
    publicRoute: null,
    routeMounted: false,
    browserResultAuthority: false,
    serverVerificationRequired: true,
    credentialEnvAuthorityDefined: false,
  } as const);

export interface ProductionPaymentAttemptServerVerificationRequestV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
}

export interface ProductionPaymentAttemptServerVerificationRuntimeV1 {
  handleRequest(
    input: ProductionPaymentAttemptServerVerificationRequestV1,
  ): Promise<Response>;
  close(): Promise<void>;
}

export interface CreateProductionPaymentAttemptServerVerificationRuntimeInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /**
   * Server-injected PortOne verifier configuration. This runtime deliberately
   * does not define or read new PortOne credential environment-variable names.
   */
  readonly verificationConfig: PortOneV2PaymentVerificationAdapterConfigV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /** Only an explicitly configured, consent-verified analytics adapter.
   * This does not activate the presently unmounted payment route. */
  readonly onVerifiedReceiptCommitted?: (input: {
    readonly request: Request; readonly receiptId: string;
  }) => Promise<void>;
  /** Opt-in: provider-verified production Reading receipt and active consent only. */
  readonly verifiedPurchaseAnalytics?: Pick<ReturnType<typeof createAdminAnalyticsVerifiedPurchaseAdapterV1>, 'record'>;
}

/**
 * Production dependency composition for owned Payment Attempt server verification.
 *
 * PortOne verifier configuration is validated before a PostgreSQL pool lease is
 * created, so invalid provider configuration cannot create an owned DB resource.
 * The runtime remains unmounted: route binding is a separate authority decision.
 */
export function createProductionPaymentAttemptServerVerificationRuntimeV1(
  input: CreateProductionPaymentAttemptServerVerificationRuntimeInputV1,
): ProductionPaymentAttemptServerVerificationRuntimeV1 {
  if(input.verifiedPurchaseAnalytics!==undefined&&input.onVerifiedReceiptCommitted!==undefined)
    throw Error('Ambiguous purchase analytics observer configuration');

  const userDataConfig = parseProductionUserDataRuntimeConfigV1(input.env);

  // Validate and snapshot server-side provider credentials before pool ownership.
  const verificationAdapter = createPortOneV2PaymentVerificationAdapterV1(
    input.verificationConfig,
  );

  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({
    config: userDataConfig,
    ...(input.memberFetchImpl === undefined
      ? {}
      : { memberFetchImpl: input.memberFetchImpl }),
  });

  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config: userDataConfig,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });

  const observer=input.verifiedPurchaseAnalytics===undefined?input.onVerifiedReceiptCommitted:
    async ({request,receiptId}:{readonly request:Request;readonly receiptId:string})=>{
      await input.verifiedPurchaseAnalytics!.record(request,receiptId);
    };

  return Object.freeze({
    handleRequest(
      requestInput: ProductionPaymentAttemptServerVerificationRequestV1,
    ) {
      return handlePaymentAttemptServerVerificationRequestV1({
        request: requestInput.request,
        requestId: requestInput.requestId,
        serverTime: requestInput.serverTime,
        identityEvidenceVerifier,
        pool: poolLease.pool,
        verificationAdapter,
        ...(observer === undefined ? {} :
          { onVerifiedReceiptCommitted: observer }),
      });
    },
    close() {
      return poolLease.close();
    },
  });
}
