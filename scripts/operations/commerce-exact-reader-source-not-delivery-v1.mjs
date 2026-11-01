// Commerce P4: distinguish immutable Reader interpretation identity and
// official Reading source commit from the actual supply of purchased content
// to a consumer. Internal READ ONLY, NOT a delivery record or legal authority.
export const COMMERCE_EXACT_READER_SOURCE_NOT_DELIVERY_V1=Object.freeze({
 schemaVersion:'commerce-exact-reader-source-not-delivery-v1',
 readOnly:true,publicRouteMounted:false,productionMounted:false,
 authorizedDeliveryEvidenceSource:false,
 createsDeliveryReceipt:false,legalRefundAuthority:false,
 providerRefundEnabled:false,entitlementEffectEnabled:false,
});

export const COMMERCE_EXACT_READER_SOURCE_SNAPSHOT_SQL_V1=`
select
 binding.reading_id::text as "officialReadingId",
 binding.subject_id::text as "subjectId",
 interpretation.reader_character_id as "readerCharacterId",
 paid.reader_content_bundle_id::text as "readerContentBundleId",
 reading.execution_status as "executionStatus",
 reading.committed_execution_attempt_id::text as "committedExecutionAttemptId",
 (reading.completed_at is not null) as "hasCompletedAt",
 refs.response_hash as "responseHash",
 refs.product_response_state as "internalResponseState"
from public.standard_reading_official_bindings binding
join public.standard_reading_reader_interpretations interpretation
 on interpretation.official_reading_id=binding.reading_id
 and interpretation.subject_id=binding.subject_id
join public.standard_reading_reader_access_grants paid
 on paid.official_reading_id=binding.reading_id
 and paid.subject_id=binding.subject_id
 and paid.reader_character_id=interpretation.reader_character_id
 and paid.entitlement_grant_id=$4::uuid
 and paid.purchase_intent_id=$5::uuid
 and paid.reader_content_bundle_id=$6::uuid
join public.readings reading
 on reading.id=binding.reading_id
 and reading.subject_id=binding.subject_id
 and reading.reading_session_id=binding.reading_session_id
left join public.reading_refs refs
 on refs.reading_id=reading.id
 and refs.subject_id=reading.subject_id
 and refs.execution_attempt_id=reading.committed_execution_attempt_id
where binding.reading_id=$1::uuid
 and binding.subject_id=$2::uuid
 and interpretation.reader_character_id=$3::text
limit 2
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID=/^[^\u0000-\u001f\u007f]{1,160}$/u;
const result=(kind)=>Object.freeze({
 schemaVersion:COMMERCE_EXACT_READER_SOURCE_NOT_DELIVERY_V1.schemaVersion,
 kind,
 privateReaderInterpretationIdentityObserved:kind!=='not_observed'&&
  kind!=='inconsistent_private_source',
 officialSourceCommittedButNotDelivered:kind==='official_source_committed_not_consumer_delivery',
 durableConsumerDeliveryProven:false,
 consumerDeliveryEventObserved:false,
 legalRefundAuthority:false,grantRevocationAuthorized:false,
 providerRefundAuthorized:false,writesPerformed:false,
});

/**
 * Caller supplies ONLY identities already bound in a separate, exact paid
 * Receipt→Event→Reader Grant READ ONLY snapshot. This query never reads a
 * customer delivery table and never interprets the internal "delivered"
 * response state as consumer receipt.
 */
export async function inspectExactReaderPrivateSourceNotDeliveryV1(client,{
 officialReadingId,subjectId,readerCharacterId,
 entitlementGrantId,purchaseIntentId,readerContentBundleId,
}){
 if(![officialReadingId,subjectId,readerContentBundleId,
      entitlementGrantId,purchaseIntentId].every(
  x=>typeof x==='string'&&UUID.test(x),
 )||typeof readerCharacterId!=='string'||
   !ID.test(readerCharacterId)||
   readerCharacterId.trim()!==readerCharacterId)
  throw Error('INVALID_EXACT_READER_PRIVATE_SOURCE_SCOPE');
 const rows=await client.query(COMMERCE_EXACT_READER_SOURCE_SNAPSHOT_SQL_V1,[
  officialReadingId,subjectId,readerCharacterId,
  entitlementGrantId,purchaseIntentId,readerContentBundleId,
 ]);
 if(rows.rows.length===0)return result('not_observed');
 if(rows.rows.length!==1)return result('inconsistent_private_source');
 const r=rows.rows[0];
 if(r.officialReadingId!==officialReadingId||
    r.subjectId!==subjectId||
    r.readerCharacterId!==readerCharacterId||
    r.readerContentBundleId!==readerContentBundleId||
    typeof r.executionStatus!=='string'||
    typeof r.hasCompletedAt!=='boolean')
  return result('inconsistent_private_source');
 // A privately committed official Source is NOT a Reader-delivery artifact,
 // a browser HTTP receipt, a customer ACK or a statutory refund restriction.
 if(r.executionStatus==='succeeded'){
  if(typeof r.committedExecutionAttemptId==='string'&&
     UUID.test(r.committedExecutionAttemptId)&&
     r.hasCompletedAt===true&&
     typeof r.responseHash==='string'&&r.responseHash.length>0&&
     ['delivered','delivered_with_fallback'].includes(r.internalResponseState))
   return result('official_source_committed_not_consumer_delivery');
  return result('inconsistent_private_source');
 }
 // Detect impossible partial commit evidence but never infer customer access.
 if(r.committedExecutionAttemptId!==null||r.hasCompletedAt!==false||
    r.responseHash!==null||r.internalResponseState!==null)
  return result('inconsistent_private_source');
 return result('private_source_not_committed');
}
