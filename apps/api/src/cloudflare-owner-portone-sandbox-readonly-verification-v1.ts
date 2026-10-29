// Watchtower-Track: commerce-payment
// Read-only test receipt inspection until a distinct Commerce-internal
// Postgres execution identity is provisioned. The current Cloudflare
// Member login cannot SET LOCAL ROLE myeongha_commerce_internal_executor.
// Never bypass that separation by granting the internal role to the
// general Cloudflare login or fabricating a Commerce Receipt in the browser.
import {createCloudflarePortOneOwnerTestVerifierV1,
  type CloudflarePortOneTestBindingEnvironmentV1}
  from './cloudflare-portone-v2-test-bindings-v1.js';
import {executeCommercePaymentVerificationV1}
 from './commerce-payment-verification-execution.js';
import {loadCommercePaymentVerificationContextV1}
 from './commerce-payment-verification-context-read.js';
import {executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1}
 from './subject-identity-resolver.js';

export const CLOUDFLARE_OWNER_SANDBOX_PSP_READONLY_V1=Object.freeze({
  provider:'portone_v2',
  environment:'sandbox',
  serverPaidVerification:true,
  receiptPersistenceEnabled:false,
  creditMintEnabled:false,
  productionCheckoutEnabled:false,
} as const);
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
function deny():never{throw Error('Owner sandbox provider receipt inspection unavailable.');}
export interface InspectOwnerKcpSandboxPaymentInputV1{
 readonly env:CloudflarePortOneTestBindingEnvironmentV1;
 readonly pool:PostgresSubjectPoolV1;
 readonly verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
 readonly paymentAttemptId:unknown;
}
export async function inspectCloudflareOwnerKcpSandboxPaymentV1(
 input:InspectOwnerKcpSandboxPaymentInputV1,
):Promise<Readonly<{
 paymentAttemptId:string;
 environment:'sandbox';
 providerVerifiedPaid:true;
 receiptPersisted:false;
 productionCreditsIssued:false;
}>>{
 if(input.verifiedEvidence?.kind!=='member'||
    typeof input.paymentAttemptId!=='string'||!UUID.test(input.paymentAttemptId))
   return deny();
 const adapter=await createCloudflarePortOneOwnerTestVerifierV1(input.env,{
   pool:input.pool,verifiedEvidence:input.verifiedEvidence,
 });
 const context=await executePostgresSubjectTransactionV1({
   pool:input.pool,verifiedEvidence:input.verifiedEvidence,
   execute:async(scope)=>loadCommercePaymentVerificationContextV1({
     scope,paymentAttemptId:input.paymentAttemptId,
   }),
 });
 if(context.environment!=='sandbox'||context.provider!=='portone_v2'||
    context.platform!=='web'||context.expectedAmountMinor!==1900||
    context.expectedCurrency!=='KRW'||
    context.expectedExternalProductId!=='myeongha-chat-credits-300-v1'||
    !/^mha_pa_[a-f0-9]{32}$/u.test(context.providerRequestId))
  return deny();

 const verified=await executeCommercePaymentVerificationV1({context,adapter});
 if(verified.environment!=='sandbox'||verified.currentState!=='active'||
    verified.ownerBinding.kind!=='purchase_intent')
  return deny();
 return Object.freeze({
   paymentAttemptId:input.paymentAttemptId.toLowerCase(),
   environment:'sandbox' as const,
   providerVerifiedPaid:true as const,
   receiptPersisted:false as const,
   productionCreditsIssued:false as const,
 });
}
