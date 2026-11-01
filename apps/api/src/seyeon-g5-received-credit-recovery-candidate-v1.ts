// Watchtower-Track: security
// Intentionally unmounted. No scheduler, HTTP route, external key or Provider.
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import {executePostgresCommerceInternalTransactionV1}
  from './postgres-commerce-internal-execution.js';

export const SEYEON_G5_RECEIVED_CREDIT_RECOVERY_CANDIDATE_V1=Object.freeze({
  productionMounted:false,
  scheduled:false,
  onlyAlreadyAcknowledgedOriginalReplies:true,
  minimumReceiptAgeMinutes:5,
  maximumBatch:25,
} as const);

const ATTEMPT_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type SeyeonG5RecoverySummaryV1=Readonly<{
  status:'empty'|'completed'|'partial';
  found:number;
  settled:number;
  failed:number;
}>;

/**
 * Reconciles stranded received-but-unsettled positive replies after a credit
 * DB outage. This cannot manufacture a receipt, mint credit or refund an
 * undelivered reply. Selection and settlement both require non-public SQL
 * EXECUTE under the dedicated Commerce role.
 *
 * A successful receipt+settlement still needs explicit G6 adoption. Do NOT
 * mount this candidate or run against hosted Production.
 */
export async function recoverSeyeonG5ReceivedCreditsCandidateV1(input:Readonly<{
  privateCreditPool:PostgresSubjectPoolV1;
  maxBatch?:number;
}>):Promise<SeyeonG5RecoverySummaryV1>{
  if(!input.privateCreditPool)throw Error('Private Commerce pool required');
  const maxBatch=input.maxBatch??25;
  if(!Number.isInteger(maxBatch)||maxBatch<1||maxBatch>25){
    throw Error('G5 recovery batch must be within 1..25');
  }
  const ids=await executePostgresCommerceInternalTransactionV1({
    pool:input.privateCreditPool,
    execute:async({client})=>{
      const found=await client.query<{attemptId:unknown}>(
        'select attempt_id as "attemptId" from '+
          'public.internal_qry_seyeon_g5_unsettled_received_attempts_v1($1::integer)',
        [maxBatch],
      );
      if(found.rows.length>maxBatch)throw Error('G5 recovery catalog exceeded bounded batch');
      const seen=new Set<string>();
      for(const r of found.rows){
        if(typeof r.attemptId!=='string'||!ATTEMPT_UUID.test(r.attemptId)||
          seen.has(r.attemptId)){
          throw Error('G5 recovery catalog returned an invalid or duplicate Attempt');
        }
        seen.add(r.attemptId);
      }
      return Array.from(seen);
    },
  });
  let settled=0,failed=0;
  for(const attemptId of ids){
    try{
      await executePostgresCommerceInternalTransactionV1({
        pool:input.privateCreditPool,
        execute:async({client})=>{
          const result=await client.query<{state:unknown}>(
            'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as "state"',
            [attemptId],
          );
          if(result.rows.length!==1||result.rows[0]?.state!=='settled'){
            throw Error('G5 original receipt settlement not confirmed');
          }
        },
      });
      settled++;
    }catch{
      // Isolated transaction ROLLBACK; another worker or an identity change
      // may have invalidated this catalog snapshot. Never forge a success.
      failed++;
    }
  }
  return Object.freeze({
    status:failed?'partial':ids.length?'completed':'empty',
    found:ids.length,settled,failed,
  });
}
