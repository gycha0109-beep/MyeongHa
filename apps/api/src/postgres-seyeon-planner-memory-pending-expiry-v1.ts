// Watchtower-Track: security
// S0 isolated UC-06/SRC-05 housekeeping. No public route or production
// schedule. A separate trusted server policy must choose the retention cutoff.
// DB Owner alone may execute; the ordinary API role is explicitly denied.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UTC_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SQL=`
select proposal_id::text as "proposalId",
       subject_id::text as "subjectId",
       payload_purged as "payloadPurged"
from seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
  $1::timestamptz,$2::integer
)`.trim();

export const SEYEON_PLANNER_PENDING_EXPIRY_V1=Object.freeze({
  dbFunction:'seyeon_private.cmd_expire_pending_planner_memory_batch_v1',
  ordinaryApiExecuteGranted:false,
  productionMounted:false,
  defaultAdmission:'DENY',
  hardcodedRetentionPeriod:false,
  maximumBatchSize:100,
} as const);

export class SeyeonPlannerPendingExpiryHoldV1 extends Error {
  readonly code='SEYEON_PLANNER_PENDING_EXPIRY_HOLD' as const;
  constructor(){
    super('An explicitly approved and bounded internal retention policy is required.');
    this.name='SeyeonPlannerPendingExpiryHoldV1';
  }
}

export async function expireSeyeonPendingPlannerMemoryBatchV1(input: Readonly<{
  client:PostgresTransactionQueryV1;
  cutoffUtc:string;
  maxRows:number;
  /** Must be authenticated out-of-band by the server. Never accept a
   * browser, model or environment flag as approval. */
  approvedInternalRetentionPolicy?:()=>boolean|Promise<boolean>;
}>):Promise<readonly Readonly<{
  proposalId:string;
  subjectId:string;
  payloadPurged:true;
}>[]> {
  const {cutoffUtc,maxRows}=input;
  const cutoffMs=typeof cutoffUtc==='string'&&UTC_TIME.test(cutoffUtc)
    ? Date.parse(cutoffUtc):NaN;
  if (!Number.isFinite(cutoffMs)||cutoffMs>Date.now()||
      !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>100||
      !input.client || typeof input.client.query!=='function') {
    throw new SeyeonPlannerPendingExpiryHoldV1();
  }
  let admitted=false;
  try {
    admitted=input.approvedInternalRetentionPolicy!==undefined &&
      (await input.approvedInternalRetentionPolicy())===true;
  } catch {
    admitted=false;
  }
  if(!admitted)throw new SeyeonPlannerPendingExpiryHoldV1();
  const result=await input.client.query<{
    proposalId:unknown;
    subjectId:unknown;
    payloadPurged:unknown;
  }>(SQL,[cutoffUtc,maxRows]);
  if(result.rows.length>maxRows)throw new SeyeonPlannerPendingExpiryHoldV1();
  const seen=new Set<string>();
  const records=result.rows.map(row=>{
    if(typeof row.proposalId!=='string'||!UUID.test(row.proposalId)||
       typeof row.subjectId!=='string'||!UUID.test(row.subjectId)||
       row.payloadPurged!==true||seen.has(row.proposalId)){
      throw new SeyeonPlannerPendingExpiryHoldV1();
    }
    seen.add(row.proposalId);
    return Object.freeze({
      proposalId:row.proposalId,subjectId:row.subjectId,
      payloadPurged:true as const,
    });
  });
  return Object.freeze(records);
}
