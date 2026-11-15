import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import { createApprovedSajuSandboxHttpRuntimeV1 } from './approved-saju-sandbox-http-runtime-v1.js';
import { createApprovedSajuOwnerTestRefundReconcileV1 } from './approved-saju-owner-test-refund-reconcile-v1.js';
import { createApprovedSajuSandboxLoopbackHostV1 } from './approved-saju-sandbox-loopback-host-v1.js';
import { createApprovedSajuT10PairReaderHttpV1 } from './approved-saju-t10-pair-reader-http-v1.js';
import type { SajuT10ProductionPairTrustV1 } from './saju-t10-production-pair-issue-source-v1.js';
import { handleTargetPersonReadRequestV1 } from './target-person-read-http.js';
import { handleSupabaseAuthRequestV1 } from './supabase-auth-http.js';
import { handleBirthProfileCreateRequestV1 } from './birth-profile-create-http.js';
import { handleCurrentSubjectBirthProfileRequestV1 } from './current-subject-birth-profile-http.js';
import { createProductionBirthInputFingerprintPortV1 } from './production-birth-input-fingerprint.js';
import { handleCurrentSubjectSajuCalculationRequestV1 } from './current-subject-saju-calculation-http.js';
import { createSajuProductionCalculationHttpAdapterV1 } from './saju-production-calculation-http-adapter.js';
import { handleReadingHistoryRequestV1 } from './reading-history-http.js';
import { handleOfficialReadingRecordRequestV1 } from './official-reading-record-http.js';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
  type SupabaseMemberVerifierFetchV1,
} from './supabase-member-identity-verifier.js';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN } from './production-user-data-runtime-config.js';

/**
 * The owner-only, local TEST runtime mounts existing authorized HTTP handlers.
 * Production database credentials, Cloudflare routes, official issuer workers,
 * public sale enablement and migrations are never created here.
 */
export function createApprovedSajuSandboxOwnerRuntimeV1(input: Readonly<{
  origin: string;
  staticRoot: string;
  supabaseOrigin: string;
  supabaseApiKey: string;
  /** Random local-only 32+ byte signing material. Never shared with clients. */
  birthInputHmacSecret?: string;
  /** Existing private Saju calculation Source, separate from payment claims. */
  sajuCalculation?: Readonly<{ origin: string; bearerToken: string }>;
  channel: Readonly<{ environment: 'sandbox'; storeId: string; channelKey: string }>;
  memberPool: PostgresSubjectPoolV1;
  commercePool: PostgresSubjectPoolV1;
  /** Independent read-only role; never use the issuer or checkout DB connection. */
  pairReader?: Readonly<{ pool: PostgresSubjectPoolV1; trust: SajuT10ProductionPairTrustV1 }>;
  verificationAdapter: CommercePaymentVerificationAdapterV1;
  /** Private PortOne TEST credentials, never exposed to the browser. */
  testRefund?: Readonly<{ apiSecret: string; evidenceHmacSecret: string }>;
  memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  sdkFetch?: typeof fetch;
}>) {
  if (input.memberPool === input.commercePool) {
    throw new Error('Saju sandbox owner runtime requires separate member and commerce DB roles.');
  }
  if (input.pairReader && (input.pairReader.pool === input.memberPool || input.pairReader.pool === input.commercePool)) {
    throw new Error('Signed T10 archive requires a separate read-only DB role.');
  }
  if (input.supabaseOrigin !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error('Saju sandbox Owner login must use the existing governed Supabase Auth project.');
  }
  const memberAuth = new SupabaseMemberIdentityEvidenceVerifierV1({
    supabaseOrigin: input.supabaseOrigin,
    supabaseApiKey: input.supabaseApiKey,
    ...(input.memberFetchImpl === undefined ? {} : { fetchImpl: input.memberFetchImpl }),
  });
  const checkout = createApprovedSajuSandboxHttpRuntimeV1({
    origin: input.origin, channel: input.channel,
    pool: input.memberPool, commercePool: input.commercePool,
    identityEvidenceVerifier: memberAuth,
    verificationAdapter: input.verificationAdapter,
  });
  const birthFingerprint = input.birthInputHmacSecret === undefined ? undefined
    : createProductionBirthInputFingerprintPortV1(input.birthInputHmacSecret);
  const calculationAdapter = input.sajuCalculation === undefined ? undefined
    : createSajuProductionCalculationHttpAdapterV1({
      baseUrl: input.sajuCalculation.origin,
      bearerToken: input.sajuCalculation.bearerToken,
    });
  const shared = (request: Request) => ({
    request, requestId: randomUUID(), serverTime: new Date().toISOString(),
    identityEvidenceVerifier: memberAuth, pool: input.memberPool,
  });
  const host = createApprovedSajuSandboxLoopbackHostV1({
    origin: input.origin,
    staticRoot: input.staticRoot,
    runtime: checkout,
    ...(input.testRefund === undefined ? {} : {
      refundReconciler: createApprovedSajuOwnerTestRefundReconcileV1({
        commercePool: input.commercePool,
        apiSecret: input.testRefund.apiSecret,
        evidenceHmacSecret: input.testRefund.evidenceHmacSecret,
      }),
    }),
    ...(input.sdkFetch === undefined ? {} : { sdkFetch: input.sdkFetch }),
    ...(input.pairReader === undefined ? {} : {
      signedPairReader: createApprovedSajuT10PairReaderHttpV1({
        origin: input.origin, pool: input.pairReader.pool,
        trusts: [input.pairReader.trust],
        verifyRequestIdentity: request => memberAuth.verifyRequestIdentity(request),
      }),
    }),
    ...(birthFingerprint === undefined ? {} : {
      ownerBirth: {
        create: (request: Request) => handleBirthProfileCreateRequestV1({
          ...shared(request),
          idPort: { nextBirthProfileId: randomUUID, nextBirthRevisionId: randomUUID },
          fingerprintPort: birthFingerprint,
        }),
        current: (request: Request) => handleCurrentSubjectBirthProfileRequestV1(shared(request)),
        ...(calculationAdapter === undefined ? {} : {
          calculate: (request: Request) => handleCurrentSubjectSajuCalculationRequestV1({
            ...shared(request), sajuAdapter: calculationAdapter,
          }),
        }),
      },
    }),
    memberAuth: (request, action) => handleSupabaseAuthRequestV1({
      request, action,
      env: {
        MYEONGHA_SUPABASE_URL: input.supabaseOrigin,
        MYEONGHA_SUPABASE_API_KEY: input.supabaseApiKey,
      },
    }),
    ownerReads: {
      targets: request => handleTargetPersonReadRequestV1(shared(request)),
      readings: request => {
        const url = new URL(request.url);
        if (url.searchParams.has('purchaseIntentId') || url.searchParams.has('readingId')) {
          return handleOfficialReadingRecordRequestV1({
            ...shared(request), approvedSajuArchiveEnabled: true,
          });
        }
        return handleReadingHistoryRequestV1({
          ...shared(request), approvedSajuArchiveEnabled: true,
        });
      },
    },
  });
  return Object.freeze({
    start: () => host.start(),
    close: () => host.close(),
  });
}
