// Watchtower-Track: commerce-payment
// Owner-only PortOne V2 TEST payment receipt verifier. Unlike a browser SDK
// callback, only the provider's server-side payment lookup yields evidence.
// Recording one verified sandbox Receipt NEVER mints production credits.
import {createCloudflarePortOneOwnerTestVerifierV1,
  type CloudflarePortOneTestBindingEnvironmentV1}
  from './cloudflare-portone-v2-test-bindings-v1.js';
import {executeSubjectOwnedCommercePaymentCompletionV1}
  from './commerce-subject-payment-completion-orchestration.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

export const CLOUDFLARE_OWNER_PORTONE_SANDBOX_RECEIPT_VERIFICATION_V1=Object.freeze({
  environment:'sandbox',
  provider:'portone_v2',
  serverVerificationRequired:true,
  browserPaymentResultAuthority:false,
  publicRouteMounted:false,
  productionCheckoutEnabled:false,
  creditMintEnabled:false,
} as const);

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;

function deny():never{
  throw new Error('Owner PortOne sandbox receipt verification unavailable.');
}

/**
 * Caller supplies only the server-issued Payment Attempt UUID. The governed
 * DB retrieves Subject, Offer, expected amount and providerRequestId; the
 * PortOne adapter independently verifies the PSP-owned paid result.
 */
export async function verifyCloudflareOwnerPortOneSandboxReceiptV1(input:Readonly<{
  env:CloudflarePortOneTestBindingEnvironmentV1;
  pool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  paymentAttemptId:unknown;
}>):Promise<Readonly<{
  paymentAttemptId:string;
  receiptId:string;
  replayed:boolean;
  environment:'sandbox';
  productionCreditsIssued:false;
}>>{
  if(input.verifiedEvidence?.kind!=='member'||
     typeof input.paymentAttemptId!=='string'||
     !UUID.test(input.paymentAttemptId))return deny();

  // Verify the DB-recognized Owner Admin FIRST. A browser cannot claim this.
  // No API Secret, PSP request or internal commerce transaction is attempted
  // when the Owner sandbox authority or HMAC signing key is unavailable.
  const adapter=await createCloudflarePortOneOwnerTestVerifierV1(input.env,{
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
  });

  const result=await executeSubjectOwnedCommercePaymentCompletionV1({
    pool:input.pool,
    verifiedEvidence:input.verifiedEvidence,
    paymentAttemptId:input.paymentAttemptId,
    verificationAdapter:adapter,
  });
  if(result.paymentAttemptId!==input.paymentAttemptId.toLowerCase()||
     typeof result.receiptId!=='string'||!UUID.test(result.receiptId)||
     typeof result.replayed!=='boolean')return deny();

  return Object.freeze({
    paymentAttemptId:result.paymentAttemptId,
    receiptId:result.receiptId,
    replayed:result.replayed,
    environment:'sandbox' as const,
    productionCreditsIssued:false as const,
  });
}
