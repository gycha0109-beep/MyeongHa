// Watchtower-Track: commerce-payment
// Only the server-verified PortOne PAID evidence is attested. A DB-held
// independent K2 HMAC authorizes a narrowly scoped SECURITY DEFINER
// receipt command without granting general Commerce-internal executor role.
// This does NOT mint credits: the wallet grant requires a Production receipt.
import {createHmac} from 'node:crypto';
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

export const CLOUDFLARE_OWNER_KCP_SIGNED_SANDBOX_RECEIPT_V1=Object.freeze({
  requiredEnv:'MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET',
  function:'public.cmd_persist_owner_kcp_signed_sandbox_receipt_v1',
  environment:'sandbox',
  productionCreditsIssued:false,
  publicCheckoutEnabled:false,
} as const);
type SignedReceiptEnvV1=CloudflarePortOneTestBindingEnvironmentV1&{
 readonly MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET?:unknown;
};
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const K2=/^[a-f0-9]{96}$/u;
const SQL=`
select receipt_id::text as "receiptId",
       provider_event_id::text as "providerEventId",
       replayed
from public.cmd_persist_owner_kcp_signed_sandbox_receipt_v1(
 $1::uuid,$2::uuid,$3::text,$4::text
)`.trim();
type StoredRow=Readonly<{receiptId?:unknown;providerEventId?:unknown;replayed?:unknown}>;
function deny():never{throw new Error('Owner KCP signed sandbox receipt unavailable.');}

export async function persistCloudflareOwnerKcpSignedSandboxReceiptV1(input:Readonly<{
 env:SignedReceiptEnvV1;
 pool:PostgresSubjectPoolV1;
 verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
 paymentAttemptId:unknown;
}>):Promise<Readonly<{
 paymentAttemptId:string;
 receiptId:string;
 providerEventId:string;
 replayed:boolean;
 environment:'sandbox';
 providerVerifiedPaid:true;
 receiptPersisted:true;
 productionCreditsIssued:false;
}>>{
 if(input.verifiedEvidence?.kind!=='member'||
   typeof input.paymentAttemptId!=='string'||
   !UUID.test(input.paymentAttemptId))return deny();
 const k2=input.env?.MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET;
 if(typeof k2!=='string'||!K2.test(k2))return deny();
 const paymentAttemptId=input.paymentAttemptId.toLowerCase();
 const adapter=await createCloudflarePortOneOwnerTestVerifierV1(input.env,{
   pool:input.pool,verifiedEvidence:input.verifiedEvidence,
 });
 const canonical=await executePostgresSubjectTransactionV1({
  pool:input.pool,verifiedEvidence:input.verifiedEvidence,
  execute:async scope=>({
    subjectId:scope.resolvedSubject.subjectId,
    context:await loadCommercePaymentVerificationContextV1({
      scope,paymentAttemptId,
    }),
  }),
 });
 const context=canonical.context;
 if(typeof canonical.subjectId!=='string'||!UUID.test(canonical.subjectId)||
    context.environment!=='sandbox'||context.provider!=='portone_v2'||
    context.platform!=='web'||context.expectedAmountMinor!==1900||
    context.expectedCurrency!=='KRW'||
    context.expectedExternalProductId!=='myeongha-chat-credits-300-v1'||
    !/^mha_pa_[a-f0-9]{32}$/u.test(context.providerRequestId))return deny();

 const evidence=await executeCommercePaymentVerificationV1({context,adapter});
 if(evidence.environment!=='sandbox'||evidence.provider!=='portone_v2'||
    evidence.platform!=='web'||evidence.currentState!=='active'||
    evidence.ownerBinding.kind!=='purchase_intent'||
    evidence.ownerBinding.purchaseIntentId!==context.purchaseIntentId||
    evidence.verifiedAmountMinor!==1900||evidence.verifiedCurrency!=='KRW')
    return deny();
 const payload=JSON.stringify({
  schemaVersion:'owner-kcp-sandbox-signed-receipt-v1',
  subjectId:canonical.subjectId.toLowerCase(),
  paymentAttemptId,
  providerRequestId:context.providerRequestId,
  evidence,
 });
 if(Buffer.byteLength(payload,'utf8')>4096)return deny();
 const signature=createHmac('sha256',k2).update(payload,'utf8').digest('hex');
 const saved=await executePostgresSubjectTransactionV1({
  pool:input.pool,verifiedEvidence:input.verifiedEvidence,
  execute:async ({client,resolvedSubject})=>{
    if(resolvedSubject.subjectId!==canonical.subjectId||
       resolvedSubject.subjectKind!=='member')return deny();
    const result=await client.query<StoredRow>(SQL,[
      resolvedSubject.subjectId,paymentAttemptId,payload,signature,
    ]);
    if(result.rows.length!==1)return deny();
    const row=result.rows[0];
    if(!row||typeof row.receiptId!=='string'||!UUID.test(row.receiptId)||
       typeof row.providerEventId!=='string'||!UUID.test(row.providerEventId)||
       typeof row.replayed!=='boolean')return deny();
    return {receiptId:row.receiptId.toLowerCase(),
      providerEventId:row.providerEventId.toLowerCase(),replayed:row.replayed};
  },
 });
 return Object.freeze({
  paymentAttemptId,receiptId:saved.receiptId,
  providerEventId:saved.providerEventId,replayed:saved.replayed,
  environment:'sandbox',providerVerifiedPaid:true,
  receiptPersisted:true,productionCreditsIssued:false,
 });
}
