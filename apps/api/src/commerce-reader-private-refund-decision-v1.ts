import {createHash} from 'node:crypto';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

/** Private operator-only manual decision recording; it does NOT adjudicate claims. */
export const READER_REFUND_DECISION_PRIVATE_V1=Object.freeze({
  publicRouteMounted:false,automaticLegalAdjudication:false,
  financialEvidenceRetention:'P5Y',
  reasonCodes:Object.freeze(['customer_withdrawal','non_delivery',
    'contract_mismatch','duplicate_charge','statutory_obligation','other_approved']),
});
export type OwnerReaderRefundReasonV1='customer_withdrawal'|'non_delivery'
  |'contract_mismatch'|'duplicate_charge'|'statutory_obligation'|'other_approved';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
// RLS-bypass granted to a routine executor is not legal-owner authority.
// Reject the same non-owner identities before any durable refund decision.
const UNSAFE_OWNER_OPERATIONS_ROLES=new Set([
  'anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_worker_runtime','myeongha_commerce_internal_executor',
]);
const ownerRoleAllowed=(value:unknown):value is string=>
  typeof value==='string'&&value.length>0&&value.trim()===value&&
  !UNSAFE_OWNER_OPERATIONS_ROLES.has(value);

const SHA=/^sha256:v1:[a-f0-9]{64}$/u;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const PRIVILEGE=[
  "select (rolsuper or rolbypassrls) as \"fullVisibility\",",
  "current_setting('transaction_read_only')='on' as \"readOnly\",",
  'current_user as "currentUser"',
  "from pg_catalog.pg_roles where rolname=current_user",
].join('\n');
const INSERT=[
  'insert into public.commerce_reader_full_refund_dispatches_v1(',
  'id,receipt_id,legal_decision_ref,legal_actor_ref,legal_approved_at,reason,retained_until,source_claim_fingerprint)',
  "select $1::uuid,cr.id,$3::text,$4::text,$5::timestamptz,$6::text,",
  "greatest(pg_catalog.clock_timestamp(),$5::timestamptz)+interval '5 years',",
  "case when $7::uuid is null then null else",
  "'sha256:v1:'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to($7::uuid::text,'UTF8')),'hex') end",
  'from public.commerce_receipts cr',
  'join public.purchase_intents pi on pi.id=cr.purchase_intent_id',
  "and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id and pi.status='verified'",
  'join public.purchase_intent_reader_selections prs on prs.purchase_intent_id=pi.id',
  "where cr.id=$2::uuid and cr.provider='portone_v2'",
  "and cr.environment='production' and cr.verification_status='verified'",
  "and cr.verified_amount_minor>0 and cr.verified_currency ~ '^[A-Z]{3}$'",
  'and cr.verified_at is not null',
  'and $5::timestamptz<=pg_catalog.clock_timestamp()',
  'and $5::timestamptz>=cr.created_at',
  'and ($7::uuid is null or exists (',
  '  select 1 from public.digital_reading_withdrawal_claims_private_v1 c',
  "  where c.id=$7::uuid and c.subject_id=cr.subject_id and c.state='received'",
  '    and (',
  '      (c.purchase_intent_id is null and c.unit_id is null)',
  '      or (c.purchase_intent_id=pi.id and exists (',
  '        select 1 from public.digital_reading_checkout_notice_presentations_v1 pres',
  '        where pres.purchase_intent_id=pi.id and pres.subject_id=pi.subject_id',
  '          and pres.unit_id=c.unit_id',
  '      ))',
  '    )',
  '))',
  'on conflict (receipt_id) do nothing',
  'returning id::text as "id",receipt_id::text as "receiptId",',
  'legal_decision_ref as "decisionRef",legal_actor_ref as "operatorRef",',
  'legal_approved_at as "approvedAt",reason as "reasonCode",status as "status",',
  'source_claim_fingerprint as "claimSourceFingerprint"',
].join('\n');
const REPLAY=[
  'select id::text as "id",receipt_id::text as "receiptId",',
  'legal_decision_ref as "decisionRef",legal_actor_ref as "operatorRef",',
  'legal_approved_at as "approvedAt",reason as "reasonCode",status as "status",',
  'source_claim_fingerprint as "claimSourceFingerprint"',
  'from public.commerce_reader_full_refund_dispatches_v1',
  'where receipt_id=$1::uuid limit 2',
].join('\n');
type Saved={
  id:unknown;receiptId:unknown;decisionRef:unknown;operatorRef:unknown;
  approvedAt:unknown;reasonCode:unknown;status:unknown;claimSourceFingerprint:unknown;
};
const validUuid=(x:unknown)=>typeof x==='string'&&UUID.test(x);
const iso=(x:unknown)=>x instanceof Date&&Number.isFinite(x.getTime())
  ?x.toISOString():typeof x==='string'&&TIME.test(x)&&Number.isFinite(Date.parse(x))
    ?new Date(x).toISOString():null;
function assertSaved(row:Saved|undefined,expected:{
  authorizationId:string;receiptId:string;decisionRef:string;
  operatorRef:string;approvedAt:string;reasonCode:string;claimSourceFingerprint:string|null;
}):void{
  if(!row||row.id!==expected.authorizationId||row.receiptId!==expected.receiptId
    ||row.decisionRef!==expected.decisionRef||row.operatorRef!==expected.operatorRef
    ||iso(row.approvedAt)!==expected.approvedAt||row.reasonCode!==expected.reasonCode
    ||row.claimSourceFingerprint!==expected.claimSourceFingerprint
    ||!['approved','dispatching','submitted','confirmed'].includes(String(row.status)))
    throw Error('READER_REFUND_OWNER_DECISION_REPLAY_CONFLICT');
}
/** The owner must have separately completed legal review and chosen this
 * exact Receipt; this privileged internal input is NOT an automatic approval.
 * COMMIT ambiguity returns unknown_commit, never assumes durable success.
 */
export async function recordOwnerApprovedReaderFullRefundDecisionV1(input:Readonly<{
  pool:PostgresSubjectPoolV1;authorizationId:string;receiptId:string;
  decisionRef:string;operatorRef:string;approvedAt:string;
  reasonCode:OwnerReaderRefundReasonV1;
  /** Exact existing customer claim, or omitted for independently reviewed manual cases. */
  sourceClaimId?:string;
}>):Promise<Readonly<{kind:'recorded'|'existing'|'unknown_commit';authorizationId?:string}>>{
  if(!input?.pool||typeof input.pool.connect!=='function'
    ||!validUuid(input.authorizationId)||!validUuid(input.receiptId)
    ||(input.sourceClaimId!==undefined&&!validUuid(input.sourceClaimId))
    ||typeof input.decisionRef!=='string'||!SHA.test(input.decisionRef)
    ||typeof input.operatorRef!=='string'
    ||!/^operator:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.operatorRef)
    ||typeof input.approvedAt!=='string'||!TIME.test(input.approvedAt)
    ||!Number.isFinite(Date.parse(input.approvedAt))
    ||!READER_REFUND_DECISION_PRIVATE_V1.reasonCodes.includes(input.reasonCode))
    throw Error('READER_REFUND_OWNER_DECISION_INVALID');
  const approvedAt=iso(input.approvedAt);
  if(!approvedAt||approvedAt!==input.approvedAt)
    throw Error('READER_REFUND_OWNER_DECISION_TIME_INVALID');
  const connection=await input.pool.connect();
  let active=false;
  let attemptedCommit=false;
  let poisoned:unknown;
  try{
    await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    active=true;
    const privilege=await connection.query<{
      fullVisibility:unknown;readOnly:unknown;currentUser:unknown;
    }>(PRIVILEGE);
    if(privilege.rows.length!==1||privilege.rows[0]?.fullVisibility!==true
      ||privilege.rows[0]?.readOnly!==false
      ||!ownerRoleAllowed(privilege.rows[0]?.currentUser))
      throw Error('READER_REFUND_PRIVILEGED_OWNER_REQUIRED');
    const inserted=await connection.query<Saved>(INSERT,[
      input.authorizationId,input.receiptId,input.decisionRef,
      input.operatorRef,approvedAt,input.reasonCode,input.sourceClaimId??null,
    ]);
    if(inserted.rows.length>1)throw Error('READER_REFUND_DECISION_AMBIGUOUS');
    let replayed=false;
    let row=inserted.rows[0];
    if(!row){
      const replay=await connection.query<Saved>(REPLAY,[input.receiptId]);
      if(replay.rows.length!==1)throw Error('READER_REFUND_DECISION_UNAVAILABLE');
      row=replay.rows[0];
      replayed=true;
    }
    assertSaved(row,{
      authorizationId:input.authorizationId,receiptId:input.receiptId,
      decisionRef:input.decisionRef,operatorRef:input.operatorRef,
      approvedAt,reasonCode:input.reasonCode,
      claimSourceFingerprint:input.sourceClaimId===undefined?null:
        'sha256:v1:'+createHash('sha256').update(input.sourceClaimId.toLowerCase()).digest('hex'),
    });
    attemptedCommit=true;
    await connection.query('COMMIT');
    active=false;
    return Object.freeze({
      kind:replayed?'existing':'recorded',authorizationId:input.authorizationId,
    });
  }catch(error){
    if(attemptedCommit)return Object.freeze({kind:'unknown_commit'});
    throw error;
  }finally{
    if(active){
      try{await connection.query('ROLLBACK');}
      catch(e){poisoned=e;}
    }
    connection.release(poisoned);
  }
}
