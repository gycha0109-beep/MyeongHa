// Watchtower-Track: commerce-payment
// Candidate server-owned handoff from an already persisted, DB-authorized
// Payment Attempt to a browser-safe PortOne V2 TEST checkout configuration.
// No route, Payment Attempt creation, API secret disclosure or mint authority.
import {
  CHAT_CREDIT_PORTONE_V2_OFFER_V1,
} from './portone-chat-credit-checkout-v1.js';
import {
  buildCloudflarePortOneOwnerTestCheckoutV1,
  type CloudflarePortOneTestBindingEnvironmentV1,
} from './cloudflare-portone-v2-test-bindings-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

export const CLOUDFLARE_PORTONE_OWNER_SANDBOX_HANDOFF_V1=Object.freeze({
  databaseFunction:'public.qry_commerce_owner_sandbox_credit_checkout_v2',
  publicRouteMounted:false,
  productionCheckoutEnabled:false,
  sandboxCreditMintEnabled:false,
  environment:'sandbox',
} as const);

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const PAYMENT_ID=/^[A-Za-z0-9_-]{6,40}$/u;
const SQL=`
select purchase_intent_id::text as "purchaseIntentId",
       product_offer_id::text as "productOfferId",
       provider_request_id as "paymentId",
       expected_amount_minor::text as "expectedAmountMinor",
       expected_currency as "expectedCurrency"
from public.qry_commerce_owner_sandbox_credit_checkout_v2($1::uuid,$2::uuid)
`.trim();

type CheckoutHandoffRowV1=Readonly<{
  purchaseIntentId?:unknown;
  productOfferId?:unknown;
  paymentId?:unknown;
  expectedAmountMinor?:unknown;
  expectedCurrency?:unknown;
}>;

function deny():never{
  throw new Error('Owner PortOne sandbox checkout handoff unavailable.');
}
function projectServerAuthority(rows:readonly CheckoutHandoffRowV1[]){
  if(rows.length!==1||!rows[0])return deny();
  const row=rows[0];
  if(typeof row.purchaseIntentId!=='string'||!UUID.test(row.purchaseIntentId)||
     typeof row.productOfferId!=='string'||!UUID.test(row.productOfferId)||
     typeof row.paymentId!=='string'||!PAYMENT_ID.test(row.paymentId)||
     row.expectedAmountMinor!=='1900'||
     row.expectedCurrency!=='KRW')return deny();
  return Object.freeze({
    purchaseIntentId:row.purchaseIntentId.toLowerCase(),
    productOfferId:row.productOfferId.toLowerCase(),
    paymentId:row.paymentId,
    externalProductId:CHAT_CREDIT_PORTONE_V2_OFFER_V1.externalProductId,
    amountMinor:CHAT_CREDIT_PORTONE_V2_OFFER_V1.amountMinor,
    currency:CHAT_CREDIT_PORTONE_V2_OFFER_V1.currency,
    quantityCredits:CHAT_CREDIT_PORTONE_V2_OFFER_V1.credits,
    environment:'sandbox' as const,
    // The SQL itself checked DB Owner Admin and server-verified Member
    // identity, not any request JSON/body/cookie claimed Boolean.
    ownerAdminSandboxAllowed:true as const,
  });
}

export async function loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1(input:Readonly<{
  env:CloudflarePortOneTestBindingEnvironmentV1;
  pool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  paymentAttemptId:unknown;
}>):Promise<Awaited<ReturnType<typeof buildCloudflarePortOneOwnerTestCheckoutV1>>>{
  if(input.verifiedEvidence?.kind!=='member'||
     typeof input.paymentAttemptId!=='string'||
     !UUID.test(input.paymentAttemptId))return deny();

  const serverIssued=await executePostgresSubjectTransactionV1({
    pool:input.pool,
    verifiedEvidence:input.verifiedEvidence,
    execute:async({client,resolvedSubject})=>{
      const result=await client.query<CheckoutHandoffRowV1>(SQL,[
        resolvedSubject.subjectId,
        input.paymentAttemptId,
      ]);
      return projectServerAuthority(result.rows);
    },
  });
  // This independent Owner ACL check is deliberate defense in depth.
  // Failed/missing bindings never enable an external SDK or Production rights.
  return buildCloudflarePortOneOwnerTestCheckoutV1(input.env,serverIssued,{
    pool:input.pool,
    verifiedEvidence:input.verifiedEvidence,
  });
}
