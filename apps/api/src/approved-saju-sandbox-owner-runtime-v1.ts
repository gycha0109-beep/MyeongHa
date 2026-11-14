import { randomUUID } from 'node:crypto';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import { createApprovedSajuSandboxHttpRuntimeV1 } from './approved-saju-sandbox-http-runtime-v1.js';
import { createApprovedSajuSandboxLoopbackHostV1 } from './approved-saju-sandbox-loopback-host-v1.js';
import { handleTargetPersonReadRequestV1 } from './target-person-read-http.js';
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
  channel: Readonly<{ environment: 'sandbox'; storeId: string; channelKey: string }>;
  memberPool: PostgresSubjectPoolV1;
  commercePool: PostgresSubjectPoolV1;
  verificationAdapter: CommercePaymentVerificationAdapterV1;
  memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  sdkFetch?: typeof fetch;
}>) {
  if (input.memberPool === input.commercePool) {
    throw new Error('Saju sandbox owner runtime requires separate member and commerce DB roles.');
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
  const shared = (request: Request) => ({
    request, requestId: randomUUID(), serverTime: new Date().toISOString(),
    identityEvidenceVerifier: memberAuth, pool: input.memberPool,
  });
  const host = createApprovedSajuSandboxLoopbackHostV1({
    origin: input.origin,
    staticRoot: input.staticRoot,
    runtime: checkout,
    ...(input.sdkFetch === undefined ? {} : { sdkFetch: input.sdkFetch }),
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
