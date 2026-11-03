// Watchtower-Track: commerce-payment
// P3/P4/P5 production schema presence evidence: strictly read only.
// Table presence alone NEVER authorizes sale, release, delivery or refund.
const TABLES=Object.freeze({
  protectedAnswerBody:'public.official_reader_paid_answer_bodies',
  privateDeliveryAttempt:'public.official_reader_paid_delivery_attempts_v1',
  scopedRefundDispatch:'public.commerce_reader_full_refund_dispatches_v1',
  privateWithdrawalClaim:'public.digital_reading_withdrawal_claims_private_v1',
  verifiedSajuSource:'public.official_reader_s3_source_authority_receipts_v1',
});
const KEYS=Object.keys(TABLES);

export const COMMERCE_READER_SCHEMA_HOLD_QUERY_V1=[
  'select',
  ...KEYS.map((key,i)=>`  (to_regclass('${TABLES[key]}') is not null) as "${key}"${i<KEYS.length-1?',':''}`),
].join('\n');

function validateRow(value){
  if(!value || typeof value!=='object' || Array.isArray(value)
    ||Object.keys(value).length!==KEYS.length
    ||KEYS.some(key=>typeof value[key]!=='boolean')){
    throw Error('COMMERCE_READER_SCHEMA_PRESENCE_UNTRUSTED');
  }
  return value;
}

/**
 * Explicit internal operator inspection for tables which the P3/P4 private
 * Reader transaction flow requires. This does not claim that function grants,
 * migrations, RLS, Saju semantics or PSP rights are ready.
 *
 * Keeps a read-only REPEATABLE READ DB transaction even if an external caller
 * accidentally supplies a privileged connection. Never queries customer data.
 */
export async function inspectCommerceReaderProductionSchemaHoldV1(client){
  if(!client || typeof client.query!=='function')
    throw Error('COMMERCE_READER_SCHEMA_PRIVATE_CLIENT_REQUIRED');
  let began=false;
  try{
    await client.query('begin isolation level repeatable read read only');
    began=true;
    await client.query("set local statement_timeout='10000ms'");
    const mode=await client.query(
      `select current_setting('transaction_read_only')='on' as "readOnly"`);
    if(mode?.rows?.length!==1||mode.rows[0]?.readOnly!==true)
      throw Error('COMMERCE_READER_SCHEMA_READ_ONLY_REQUIRED');
    const r=await client.query(COMMERCE_READER_SCHEMA_HOLD_QUERY_V1);
    if(r?.rows?.length!==1)
      throw Error('COMMERCE_READER_SCHEMA_PRESENCE_UNTRUSTED');
    const row=validateRow(r.rows[0]);
    const missing=Object.freeze(KEYS.filter(key=>row[key]===false));
    const present=Object.freeze(KEYS.filter(key=>row[key]===true));
    return Object.freeze({
      schemaVersion:'commerce-reader-production-schema-hold-preflight-v1',
      state:missing.length>0?'schema_incomplete':'schema_present_unverified',
      requiredTableCount:KEYS.length,
      present:present,
      missing:missing,
      p2SaleAuthorized:false,
      p3ProductionDeliveryAuthorized:false,
      p4ProductionRefundAuthorized:false,
      p5LiveLaunchAuthorized:false,
      operationsDatabaseModified:false,
      checksPerformed:Object.freeze([
        'table_name_resolution_only',
        'no_rls_or_function_grant_proof',
        'no_saju_production_or_legal_sale_approval',
      ]),
    });
  }finally{
    if(began)await client.query('rollback');
  }
}
