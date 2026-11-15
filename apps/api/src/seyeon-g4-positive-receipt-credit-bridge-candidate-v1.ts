// Watchtower-Track: security
// S0 browser-issued receipt -> original DB receipt ACK -> G4 private ledger ACK.
// Worker selects this bridge only when server-owned creditBilling.productionMounted is true.
// The production mount remains false until the dedicated Commerce authority is provisioned.
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import {executePostgresCommerceInternalTransactionV1}
  from './postgres-commerce-internal-execution.js';
import {handleSeyeonPositiveReplyReceiptV1}
  from './seyeon-first-positive-memory-fetch-delivery-v1.js';

export const SEYEON_G4_POSITIVE_RECEIPT_CREDIT_BRIDGE_V1=Object.freeze({
  productionMounted:false,
  settlementRequiresOriginalReceiptAck:true,
  creditCharge:10,
  unacknowledgedSocketFinishChargesNothing:true,
} as const);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const fail=()=>Response.json({
  ok:false,error:{code:'SEYEON_CREDIT_RECEIPT_SETTLEMENT_UNAVAILABLE',retryable:true},
},{status:503,headers:{'Cache-Control':'no-store'}});

/**
 * A capability-bearing receipt proves client possession through the existing
 * S0 issuer's one-use 256-bit secret. Its DB ACK commits BEFORE the private
 * credit transaction. Replaying that same receipt is idempotent; any crash
 * between two commits returns HOLD, never falsely reports settled credits.
 * Never mount until the reviewed S0 receipt RPC and private credit RPC are
 * deployed, credential-separated and proven in real isolated DB/HTTP tests.
 */
export async function handleSeyeonPositiveReceiptAndCreditCandidateV1(input:Readonly<{
  request:Request;
  requestId:string;
  receiptPool:PostgresSubjectPoolV1;
  privateCreditPool:PostgresSubjectPoolV1;
}>):Promise<Response>{
  if(!input.privateCreditPool || input.receiptPool===input.privateCreditPool)return fail();
  // Do not open a Commerce transaction for an invalid or unauthenticated
  // receipt: S0's original 256-bit capability proof is the authority here.
  const receipt=await handleSeyeonPositiveReplyReceiptV1({
    request:input.request,pool:input.receiptPool,requestId:input.requestId,
  });
  if(!receipt.ok)return receipt;
  const url=new URL(input.request.url);
  const match=/^\/api\/chat\/delivery-receipts\/([a-f0-9-]+)$/u.exec(url.pathname);
  const attemptId=match?.[1];
  if(!attemptId || !UUID.test(attemptId))return fail();

  try{
    const result=await executePostgresCommerceInternalTransactionV1({
      pool:input.privateCreditPool,
      execute:async({client})=>{
        const settled=await client.query<{state:unknown}>(
          'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as "state"',
          [attemptId],
        );
        if(settled.rows.length!==1 || settled.rows[0]?.state!=='settled'){
          throw Error('Original received positive reply credit settlement not confirmed');
        }
        return settled.rows[0].state;
      },
    });
    if(result!=='settled')return fail();
    return receipt;
  }catch{
    // The first S0 receipt commit may already have succeeded. Retry is safe.
    return fail();
  }
}
