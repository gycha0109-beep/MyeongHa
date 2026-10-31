// Operations-only persistence candidate. Requires built API JS and the
// NON-DEPLOYABLE SQL candidate installed into an isolated operations fixture.
// No public route, webhook mount, refund POST, Entitlement Effect or LIVE offer.
import {createHmac} from 'node:crypto';
import {resolveCancellationOriginalReceiptPrivateV1}
 from './commerce-cancellation-payment-receipt-link-v1.mjs';

export const COMMERCE_PORTONE_CANCELLATION_EVENT_PRIVATE_PERSIST_V1=Object.freeze({
 schemaVersion:'commerce-portone-cancellation-event-private-persist-v1',
 publicRouteMounted:false,productionPersistenceMounted:false,
 sqlDeployed:false,refundExecutionEnabled:false,entitlementMutationEnabled:false,
});

export const COMMERCE_PORTONE_CANCELLATION_EVENT_PERSIST_SQL_V1=`
select provider_event_id::text as "providerEventId", replayed
from public.internal_persist_portone_cancellation_event_v1(
 $1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text
)
`.trim();

const KIND=Object.freeze({
 'Transaction.Cancelled':'full_cancel_shape_observed',
 'Transaction.PartialCancelled':'partial_cancel_shape_observed',
});
const DENIED=kind=>Object.freeze({
 schemaVersion:COMMERCE_PORTONE_CANCELLATION_EVENT_PRIVATE_PERSIST_V1.schemaVersion,
 kind,canonicalEventStored:false,refunded:false,grantRevoked:false,
 refundExecutionAuthorized:false,entitlementMutationAuthorized:false,
 publicRouteMounted:false,
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const secretValid=v=>typeof v==='string'&&v.length>=32&&v.length<=4096&&v.trim()===v&&
 !/[\u0000-\u001f\u007f]/u.test(v);
const mac=(secret,parts)=>'hmac-sha256:k1:'+
 createHmac('sha256',secret).update(JSON.stringify(parts),'utf8').digest('hex');

/**
 * Re-authenticates the original signed bytes once, checks the original
 * canonical Reading Receipt with full-visibility DB authority, independently
 * fetches PortOne GET and only then saves bounded/minimized event provenance.
 *
 * The DB command is only a staged SQL candidate. Caller must hold a dedicated,
 * complete-visibility operations connection; this method NEVER uses public
 * service_role credentials or performs payment cancellation.
 */
export async function persistVerifiedPortOneCancellationEventPrivateV1({
 dbClient,request,webhookConfig,apiSecret,sourceHmacSecret,fetchImpl,
 authenticator,providerInspector,
}){
 if(!secretValid(sourceHmacSecret))return DENIED('source_fingerprint_authority_unavailable');
 if(webhookConfig?.environment!=='production')return DENIED('production_only_hold');
 let authenticate=authenticator;
 let inspect=providerInspector;
 if(!authenticate){
  ({authenticatePortOneV2CancellationWebhookCandidateV1:authenticate}=
   await import('../../dist/apps/api/src/portone-v2-cancellation-webhook-candidate-v1.js'));
 }
 if(!inspect){
  ({inspectPortOneV2CancellationViaGetCandidateV1:inspect}=
   await import('../../dist/apps/api/src/portone-v2-cancellation-readback-get-v1.js'));
 }

 // Freeze the webhook body bytes for both signature verification and hashing.
 let signed,body;
 try{
  const raw=request.rawBody;
  body=typeof raw==='string'?Buffer.from(raw,'utf8'):Buffer.from(raw);
  if(body.length===0||body.length>65536)throw Error('invalid signed payload');
  signed=authenticate({
   request:{rawBody:Uint8Array.from(body),headers:request.headers},
   config:webhookConfig,
  });
 }catch{return DENIED('authentication_rejected');}
 if(!signed||signed.kind!=='cancellation_lookup_candidate')
  return DENIED('not_cancellation_event');
 const requiredKind=KIND[signed.eventType];
 if(!requiredKind)return DENIED('pending_or_unsupported_cancellation_event');

 let original;
 try{
  original=await resolveCancellationOriginalReceiptPrivateV1(dbClient,{
   providerPaymentId:signed.providerPaymentId,
   providerTransactionId:signed.providerTransactionId,
  });
 }catch{return DENIED('original_receipt_unavailable');}
 if(!original)return DENIED('no_exact_original_reading_receipt');

 let classified;
 try{
  classified=await inspect({
   ...original,
   ...(signed.providerCancellationId===null?{}:{
    cancellationId:signed.providerCancellationId,
   }),
   apiSecret,fetchImpl,
  });
 }catch{return DENIED('provider_readback_unavailable');}
 // Not merely a signed webhook: a final shape must be independently observed.
 // The GET adapter returns no raw payment payload and no settlement permission.
 if(!classified||classified.providerReadbackFromAuthenticatedGet!==true||
    classified.kind!==requiredKind||classified.shapeConsistent!==true||
    classified.originalPaymentMatched!==true||
    classified.refundExecutionAuthorized!==false||
    classified.entitlementRevocationAuthorized!==false||
    (signed.providerCancellationId!==null&&
     classified.matchedCancellationIdObserved!==true))
  return DENIED('unverified_cancellation_semantics');

 const signedMac=mac(sourceHmacSecret,[
  'portone-cancel-signed-v1',signed.providerWebhookId,
  signed.eventType,body.toString('base64'),
 ]);
 const readbackMac=mac(sourceHmacSecret,[
  'portone-cancel-get-v1',original.providerPaymentId,
  original.originalTransactionId,original.originalVerifiedPaidAmountMinor,
  original.originalCurrency,signed.eventType,
  signed.providerCancellationId,classified.kind,
  classified.matchedCancellationIdObserved,
 ]);
 let tx=false,committing=false;
 try{
  await dbClient.query('begin isolation level serializable');tx=true;
  await dbClient.query("set local statement_timeout='10000ms'");
  const auth=await dbClient.query(`select
   current_setting('transaction_read_only')='off' as "writable",
   (rolsuper or rolbypassrls) as "completeVisibility",
   current_user as "currentUser"
   from pg_catalog.pg_roles where rolname=current_user`);
  const row=auth.rows[0];
  if(auth.rows.length!==1||row.writable!==true||
     row.completeVisibility!==true||
     ['anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_commerce_internal_executor'
     ].includes(row.currentUser))
   throw Error('CANCELLATION_PRIVATE_PERSIST_AUTHORITY_REQUIRED');

  const result=await dbClient.query(
   COMMERCE_PORTONE_CANCELLATION_EVENT_PERSIST_SQL_V1,
   [signed.providerPaymentId,signed.providerWebhookId,signed.eventType,
    original.originalTransactionId,classified.kind,signedMac,readbackMac],
  );
  if(result.rows.length!==1||
     !UUID.test(result.rows[0].providerEventId)||
     typeof result.rows[0].replayed!=='boolean')
   throw Error('CANCELLATION_PRIVATE_PERSIST_RESULT_INVALID');

  // A failed COMMIT is ambiguous: do NOT report absence or safely retry.
  committing=true;
  await dbClient.query('commit');
  tx=false;
  return Object.freeze({
   ...DENIED(result.rows[0].replayed?'canonical_event_replayed':'canonical_event_recorded'),
   canonicalEventStored:true,
   replayed:result.rows[0].replayed,
   providerOrderingProven:false,
  });
 }catch{
  if(committing)return DENIED('persistence_outcome_unknown');
  return DENIED('persistence_unavailable');
 }finally{
  if(tx)await dbClient.query('rollback').catch(()=>undefined);
 }
}
