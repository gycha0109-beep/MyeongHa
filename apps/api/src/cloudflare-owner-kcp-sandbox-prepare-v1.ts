// Watchtower-Track: commerce-payment
// Server-only idempotent Owner sandbox Purchase Intent + Payment Attempt issuer.
// The browser may supply an opaque retry token, but never an ID, price, offer,
// product, channel, environment, authority role or payment provider identity.
import {createHash} from 'node:crypto';
import {readOwnerAdminAccessV1} from './myeongha-owner-admin-access-v1.js';
import {executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

export const CLOUDFLARE_OWNER_KCP_SANDBOX_PREPARE_V1=Object.freeze({
  databaseFunction:'public.cmd_prepare_owner_portone_sandbox_credit_v1',
  environment:'sandbox',
  provider:'portone_v2',
  amountMinor:1900,
  currency:'KRW',
  credits:300,
  productionCheckoutEnabled:false,
  productionCreditMintEnabled:false,
} as const);

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const RETRY=/^[a-f0-9]{32}$/u;
const KCP_ID=/^mha_pa_[a-f0-9]{32}$/u;

function deny():never{throw Error('Owner KCP sandbox purchase preparation unavailable.');}
function sha(...components:string[]):string{
  const hash=createHash('sha256');
  for(const part of components)hash.update(part,'utf8').update('\0','utf8');
  return hash.digest('hex');
}
function deterministicUuid(hex:string):string{
  const b=hex.slice(0,32).split('');
  b[12]='4';
  b[16]=((parseInt(b[16]??'0',16)&3)|8).toString(16);
  const x=b.join('');
  return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20,32);
}
export interface OwnerKcpSandboxPrepareInputV1{
  readonly pool:PostgresSubjectPoolV1;
  readonly verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  readonly idempotencyToken:unknown;
}
export interface OwnerKcpSandboxPreparedV1{
  readonly purchaseIntentId:string;
  readonly paymentAttemptId:string;
  readonly providerRequestId:string;
  readonly status:'created';
  readonly replayed:boolean;
  readonly environment:'sandbox';
  readonly productionCreditsIssued:false;
}
interface PreparedRowV1{
  readonly purchaseIntentId?:unknown;
  readonly paymentAttemptId?:unknown;
  readonly providerRequestId?:unknown;
  readonly attemptStatus?:unknown;
  readonly replayed?:unknown;
}
const SQL=`
select purchase_intent_id::text as "purchaseIntentId",
       payment_attempt_id::text as "paymentAttemptId",
       provider_request_id as "providerRequestId",
       attempt_status as "attemptStatus",
       replayed
from public.cmd_prepare_owner_portone_sandbox_credit_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text
)`.trim();

/**
 * Enforces Owner authority inside the RPC as well as in the application.
 * Deterministic server IDs permit idempotent retry even after a transient
 * response loss. No production offer/price or credit grant can be supplied.
 */
export async function prepareCloudflareOwnerKcpSandboxPurchaseV1(
  input:OwnerKcpSandboxPrepareInputV1,
):Promise<OwnerKcpSandboxPreparedV1>{
  if(input.verifiedEvidence?.kind!=='member'||
    typeof input.idempotencyToken!=='string'||
    !RETRY.test(input.idempotencyToken))return deny();
  const owner=await readOwnerAdminAccessV1(input.pool,input.verifiedEvidence);
  if(!owner.isOwnerAdmin||!owner.sandboxCheckoutAllowed||
    typeof owner.verifiedSubjectId!=='string'||!UUID.test(owner.verifiedSubjectId))return deny();

  const subjectId=owner.verifiedSubjectId.toLowerCase();
  const logicalId=sha('myeongha:owner-kcp-sandbox:v1',subjectId,input.idempotencyToken);
  const requestKey='kcp_sbx_'+logicalId.slice(0,32);
  const purchaseIntentId=deterministicUuid(sha('myeongha:owner-kcp-sandbox:intent:v1',subjectId,requestKey));
  const paymentAttemptId=deterministicUuid(sha('myeongha:owner-kcp-sandbox:attempt:v1',subjectId,requestKey));
  const providerRequestId='mha_pa_'+createHash('sha256')
    .update('myeongha:portone-kcp-v2-sandbox-payment:v1\0')
    .update(purchaseIntentId)
    .update('\0')
    .update(requestKey)
    .digest('hex').slice(0,32);

  const result=await executePostgresSubjectTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async({client,resolvedSubject})=>{
      if(resolvedSubject.subjectKind!=='member'||resolvedSubject.subjectId!==subjectId)return deny();
      const rows=await client.query<PreparedRowV1>(SQL,[
        subjectId,purchaseIntentId,paymentAttemptId,requestKey,providerRequestId,
      ]);
      if(rows.rows.length!==1)return deny();
      const row=rows.rows[0];
      if(!row||row.purchaseIntentId!==purchaseIntentId||
         row.paymentAttemptId!==paymentAttemptId||
         row.providerRequestId!==providerRequestId||!KCP_ID.test(providerRequestId)||
         row.attemptStatus!=='created'||typeof row.replayed!=='boolean')return deny();
      return {replayed:row.replayed as boolean};
    },
  });
  return Object.freeze({
    purchaseIntentId,paymentAttemptId,providerRequestId,status:'created',
    replayed:result.replayed,environment:'sandbox',
    productionCreditsIssued:false,
  });
}
