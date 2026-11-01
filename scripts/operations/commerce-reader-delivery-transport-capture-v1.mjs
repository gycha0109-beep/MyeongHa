// Internal Writer candidate for a single exact paid Reader response transport.
// Requires installing the non-deployed candidate SQL on an isolated database.
// Prepared != sent; client ACK != human read; neither is legal delivery proof.
export const COMMERCE_READER_DELIVERY_TRANSPORT_CAPTURE_V1=Object.freeze({
 schemaVersion:'commerce-reader-delivery-transport-capture-v1',
 candidateSql:'docs/operations/candidates/commerce_reader_delivery_transport_capture_v1.sql',
 productionMounted:false,publicRouteMounted:false,
 legalDeliveryAuthority:false,providerRefundEnabled:false,
 entitlementEffectEnabled:false,
});

export const PREPARE_SQL_V1=String.raw`select delivery_attempt_id::text as "deliveryAttemptId",
 response_prepared_at as "responsePreparedAt"
from public.internal_prepare_reader_delivery_transport_v1(
 $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
 $6::text,$7::uuid,$8::uuid,$9::uuid,$10::text
)`;
export const ACK_SQL_V1=String.raw`select client_acknowledged_at as "clientAcknowledgedAt"
from public.internal_ack_reader_delivery_transport_v1(
 $1::uuid,$2::uuid,$3::text
)`;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const READER=/^[^\u0000-\u001f\u007f]{1,160}$/u;
const HMAC=/^hmac-sha256:k[0-9]+:[a-f0-9]{64}$/u;
const timestamp=(value)=>{
 const s=value instanceof Date?value.toISOString():value;
 if(typeof s!=='string'||!Number.isFinite(Date.parse(s)))throw Error('INVALID_READER_DELIVERY_DB_TIME');
 return new Date(s).toISOString();
};
const output=(stage,field,time)=>Object.freeze({
 schemaVersion:COMMERCE_READER_DELIVERY_TRANSPORT_CAPTURE_V1.schemaVersion,
 stage,[field]:time,consumerDeliveryProven:false,
 humanReadProven:false,legalDecisionAuthorized:false,
 providerRefundAuthorized:false,grantRevocationAuthorized:false,
});
const assertDb=db=>{
 if(!db||typeof db.query!=='function')
  throw Error('READER_DELIVERY_DB_REQUIRED');
};
const assertUuid=(value,name)=>{
 if(typeof value!=='string'||!UUID.test(value))
  throw Error('INVALID_READER_DELIVERY_'+name);
 return value;
};
const assertHmac=value=>{
 if(typeof value!=='string'||!HMAC.test(value))
  throw Error('INVALID_READER_DELIVERY_CHALLENGE');
 return value;
};

/**
 * This is called only by a future S5/S7 server-owner writer after independently
 * verifying protected body identity. No client-facing invocation or DB role
 * is granted. The SQL must atomically check the exact paid Reader grant.
 */
export async function prepareExactReaderDeliveryTransportCandidateV1(db,input){
 assertDb(db);
 const names=['deliveryAttemptId','purchaseIntentId','subjectId',
  'entitlementGrantId','officialReadingId'];
 const args=names.map(name=>assertUuid(input?.[name],name));
 if(typeof input?.readerCharacterId!=='string'||
   !READER.test(input.readerCharacterId)||
   input.readerCharacterId.trim()!==input.readerCharacterId)
  throw Error('INVALID_READER_DELIVERY_READER');
 args.push(input.readerCharacterId,
  assertUuid(input.readerContentBundleId,'readerContentBundleId'),
  assertUuid(input.protectedBodyId,'protectedBodyId'),
  assertUuid(input.safeMessageId,'safeMessageId'),
  assertHmac(input.ackChallengeHmac));
 const response=await db.query(PREPARE_SQL_V1,args);
 if(response?.rows?.length!==1||
   response.rows[0]?.deliveryAttemptId!==input.deliveryAttemptId)
  throw Error('READER_DELIVERY_PREPARE_NOT_DURABLY_VERIFIED');
 return output('response_prepared_not_consumer_delivery',
  'responsePreparedAt',timestamp(response.rows[0].responsePreparedAt));
}

/**
 * ACK can only be written for the exact server-issued challenge/subject.
 * It is not evidence of a human reading a purchased interpretation.
 */
export async function acknowledgeExactReaderDeliveryTransportCandidateV1(db,input){
 assertDb(db);
 const args=[
  assertUuid(input?.deliveryAttemptId,'deliveryAttemptId'),
  assertUuid(input?.subjectId,'subjectId'),
  assertHmac(input?.ackChallengeHmac),
 ];
 const response=await db.query(ACK_SQL_V1,args);
 if(response?.rows?.length!==1)
  throw Error('READER_DELIVERY_ACK_NOT_DURABLY_VERIFIED');
 return output('client_acknowledged_not_human_read',
  'clientAcknowledgedAt',timestamp(response.rows[0].clientAcknowledgedAt));
}
