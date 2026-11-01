import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

/**
 * Owner-only read-only case queue. A customer claim is NOT evidence of a
 * legally approved refund. The claim points to a Subject; an operator must
 * select an exact verified paid Reader receipt and record a separate decision.
 * Not mounted in the public API, no provider network call or entitlement write.
 */
export const READER_WITHDRAWAL_PRIVATE_REVIEW_V1=Object.freeze({
  publicRouteMounted:false,
  providerCancellationAuthorized:false,
  legalDecisionAutomatic:false,
  databaseWrites:false,
  maxCandidateReceipts:25,
} as const);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ROLE=[
  "select (rolsuper or rolbypassrls) as \"fullVisibility\",",
  "current_setting('transaction_read_only')='on' as \"readOnly\"",
  'from pg_catalog.pg_roles where rolname=current_user',
].join('\n');
const CLAIM=[
  'select id::text as "claimId",subject_id::text as "subjectId",',
  'purchase_intent_id::text as "purchaseIntentId",unit_id::text as "unitId",',
  'reason_code as "reasonCode",state as "state",received_at::text as "receivedAt"',
  'from public.digital_reading_withdrawal_claims_private_v1',
  'where id=$1::uuid limit 2',
].join('\n');
const RECEIPTS=[
  'select distinct cr.id::text as "receiptId",',
  'cr.purchase_intent_id::text as "purchaseIntentId",',
  'cr.verified_currency as "currency",cr.verified_amount_minor as "amountMinor",',
  'cr.verification_status as "verificationStatus"',
  'from public.commerce_receipts cr',
  'join public.purchase_intents pi on pi.id=cr.purchase_intent_id',
  " and pi.subject_id=cr.subject_id and pi.status='verified'",
  'join public.product_offers offer on offer.id=cr.product_offer_id',
  ' and offer.id=pi.product_offer_id',
  'join public.standard_reading_product_specs spec on spec.product_id=offer.product_id',
  " and spec.purchase_unit_mode='topic_reader_reading'",
  'join public.purchase_intent_reader_selections sel on sel.purchase_intent_id=pi.id',
  ' and sel.product_id=offer.product_id',
  'join public.digital_reading_checkout_notice_presentations_v1 pres',
  ' on pres.purchase_intent_id=pi.id and pres.subject_id=pi.subject_id',
  ' and pres.product_id=offer.product_id',
  ' and pres.reader_character_id=sel.reader_character_id',
  ' and pres.reader_content_bundle_id=sel.reader_content_bundle_id',
  ' and pres.product_spec_version=spec.spec_version',
  'where cr.subject_id=$1::uuid',
  " and cr.provider='portone_v2' and cr.environment='production'",
  " and cr.verification_status in ('verified','revoked')",
  ' and cr.verified_amount_minor=pi.expected_amount_minor',
  ' and cr.verified_currency=pi.expected_currency',
  ' and cr.verified_at>pres.server_presented_at',
  ' and ($2::uuid is null or cr.purchase_intent_id=$2::uuid)',
  ' and ($3::uuid is null or pres.unit_id=$3::uuid)',
  'order by cr.id',
  'limit 26',
].join('\n');

type ClaimRow={
  claimId:unknown;subjectId:unknown;purchaseIntentId:unknown;
  unitId:unknown;reasonCode:unknown;state:unknown;receivedAt:unknown;
};
type ReceiptRow={
  receiptId:unknown;purchaseIntentId:unknown;currency:unknown;
  amountMinor:unknown;verificationStatus:unknown;
};
export type PrivilegedWithdrawalCaseV1=Readonly<{
  claimId:string;subjectId:string;reasonCode:string;receivedAt:string;
  hasExactPurchasedUnit:boolean;requiresExplicitReceiptSelection:true;
  receipts:ReadonlyArray<Readonly<{
    receiptId:string;purchaseIntentId:string;
    currency:string;amountMinor:number;
    verificationStatus:'verified'|'revoked';
  }>>;
  candidateLimitExceeded:boolean;refundApproved:false;
  providerRefundCompleted:false;
}>;
function checkedAmount(value:unknown):number{
  const amount=typeof value==='string'?Number(value):value;
  if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0)
    throw Error('REVIEW_VERIFIED_AMOUNT_INVALID');
  return amount;
}

export async function readPrivilegedReaderWithdrawalCaseV1(input:Readonly<{
  pool:PostgresSubjectPoolV1;
  claimId:string;
}>):Promise<PrivilegedWithdrawalCaseV1|null>{
  if(!input.pool||typeof input.pool.connect!=='function'
    ||typeof input.claimId!=='string'||!UUID.test(input.claimId))
    throw Error('PRIVATE_REVIEW_REQUEST_INVALID');
  const connection=await input.pool.connect();
  let active=false;
  let discard:unknown;
  try{
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    active=true;
    const roles=await connection.query<{fullVisibility:unknown;readOnly:unknown}>(ROLE);
    if(roles.rows.length!==1||roles.rows[0]?.fullVisibility!==true
      ||roles.rows[0]?.readOnly!==true)
      throw Error('PRIVATE_REVIEW_FULL_VISIBILITY_REQUIRED');
    const records=await connection.query<ClaimRow>(CLAIM,[input.claimId]);
    if(records.rows.length===0){
      await connection.query('COMMIT');active=false;return null;
    }
    if(records.rows.length!==1)throw Error('PRIVATE_REVIEW_CLAIM_AMBIGUOUS');
    const row=records.rows[0]!;
    if(row.claimId!==input.claimId||typeof row.subjectId!=='string'
      ||!UUID.test(row.subjectId)||row.state!=='received'
      ||typeof row.reasonCode!=='string'||row.reasonCode.length>48
      ||typeof row.receivedAt!=='string'||!Number.isFinite(Date.parse(row.receivedAt))
      ||(row.purchaseIntentId===null)!==(row.unitId===null)
      ||(row.purchaseIntentId!==null&&
        (typeof row.purchaseIntentId!=='string'||!UUID.test(row.purchaseIntentId)
        ||typeof row.unitId!=='string'||!UUID.test(row.unitId))))
      throw Error('PRIVATE_REVIEW_CLAIM_INVALID');
    const receipts=await connection.query<ReceiptRow>(RECEIPTS,[
      row.subjectId,row.purchaseIntentId,row.unitId,
    ]);
    if(receipts.rows.length>26)throw Error('PRIVATE_REVIEW_CANDIDATE_LIMIT_UNKNOWN');
    const candidateLimitExceeded=receipts.rows.length>25;
    const validated=receipts.rows.slice(0,25).map(r=>{
      if(typeof r.receiptId!=='string'||!UUID.test(r.receiptId)
        ||typeof r.purchaseIntentId!=='string'||!UUID.test(r.purchaseIntentId)
        ||typeof r.currency!=='string'||!/^[A-Z]{3}$/u.test(r.currency)
        ||(r.verificationStatus!=='verified'&&r.verificationStatus!=='revoked'))
        throw Error('PRIVATE_REVIEW_RECEIPT_INVALID');
      return Object.freeze({
        receiptId:r.receiptId,purchaseIntentId:r.purchaseIntentId,
        currency:r.currency,amountMinor:checkedAmount(r.amountMinor),
        verificationStatus:r.verificationStatus,
      });
    });
    // If a claim has an exact purchased unit, no different purchase may appear.
    if(row.purchaseIntentId!==null&&
      validated.some(r=>r.purchaseIntentId!==row.purchaseIntentId))
      throw Error('PRIVATE_REVIEW_RECEIPT_MISMATCH');
    await connection.query('COMMIT');
    active=false;
    return Object.freeze({
      claimId:row.claimId,subjectId:row.subjectId,
      reasonCode:row.reasonCode,receivedAt:row.receivedAt,
      hasExactPurchasedUnit:row.purchaseIntentId!==null,
      requiresExplicitReceiptSelection:true,
      receipts:Object.freeze(validated),
      candidateLimitExceeded,
      refundApproved:false,providerRefundCompleted:false,
    });
  }catch(e){
    if(active){
      try{await connection.query('ROLLBACK');}
      catch(r){discard=r;}
    }
    throw e;
  }finally{
    connection.release(discard);
  }
}
