import {createHmac} from 'node:crypto';
import {getPortOneV2PaymentReadbackPrivateV1} from './portone-v2-cancellation-readback-get-v1.js';
import {inspectPortOneV2CancellationReadbackEvidenceV1} from
  './portone-v2-cancellation-readback-evidence-v1.js';

// Only a bounded, authenticated PortOne V2 GET. No public handler, refund,
// entitlement effect, provider sequence authority or customer-visible IDs.
export const PORTONE_V2_CANCELLATION_SET_GET_V1=Object.freeze({
 schemaVersion:'portone-v2-cancellation-set-get-v1',
 productionMounted:false,publicRouteMounted:false,
 paymentLookupHttpMethod:'GET',maxCancellationItems:64,
 refundPostEnabled:false,entitlementEffectEnabled:false,
 trustedProviderOrderingProven:false,
} as const);

type FetchPrivate=typeof fetch;
const VALID_ID=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const CURRENCY=/^[A-Z]{3}$/u;
function id(v:unknown):v is string{
 return typeof v==='string'&&VALID_ID.test(v)&&v.trim()===v;
}
function unavailable():Error{
 return Error('PortOne V2 private cancellation set readback unavailable.');
}
export interface PortOneV2CurrentCancelSetItemV1{
 readonly cancellationIdHmac:string;
 readonly exactSucceededAmountMinor:number;
}
export interface PortOneV2CurrentCancelSetV1{
 readonly schemaVersion:'portone-v2-cancellation-set-get-v1';
 readonly providerReadbackFromAuthenticatedGet:true;
 readonly originalPaymentMatched:true;
 readonly providerShapeConsistent:true;
 readonly kind:'partial_cancel_shape_observed'|'full_cancel_shape_observed'|
   'not_cancelled'|'cancellation_pending';
 readonly observedCancelledTotalMinor:number;
 readonly successfulItems:readonly PortOneV2CurrentCancelSetItemV1[];
 readonly unresolvedItemsObserved:boolean;
 readonly providerOrderingProven:false;
 readonly legalRefundAuthority:false;
 readonly grantRevocationAuthorized:false;
 readonly writesPerformed:false;
}

/**
 * Return ONLY per-item keyed HMAC and amount in an ephemeral server-only
 * object; no raw cancellationId, payment ID, subject, secret or payload.
 * The GET transport and original payment-shape check are shared with the
 * already tested individual cancellation inspector.
 */
export async function inspectPortOneV2CancellationSetViaGetCandidateV1(input:Readonly<{
 providerPaymentId:string;
 originalTransactionId:string;
 originalVerifiedPaidAmountMinor:number;
 originalCurrency:string;
 environment:'production';
 apiSecret:string;
 sourceHmacSecret:string;
 fetchImpl?:FetchPrivate|undefined;
}>):Promise<Readonly<PortOneV2CurrentCancelSetV1>>{
 if(!id(input.providerPaymentId)||!id(input.originalTransactionId)||
    !Number.isSafeInteger(input.originalVerifiedPaidAmountMinor)||
    input.originalVerifiedPaidAmountMinor<=0||
    !CURRENCY.test(input.originalCurrency)||
    input.environment!=='production'||
    typeof input.sourceHmacSecret!=='string'||
    Buffer.byteLength(input.sourceHmacSecret,'utf8')<32||
    Buffer.byteLength(input.sourceHmacSecret,'utf8')>4096||
    input.sourceHmacSecret.trim()!==input.sourceHmacSecret||
    /[\r\n\u0000-\u001f\u007f]/u.test(input.sourceHmacSecret))
   throw Error('INVALID_PORTONE_CANCEL_SET_GET_CONFIGURATION');
 let raw:unknown;
 try{
  raw=await getPortOneV2PaymentReadbackPrivateV1({
   providerPaymentId:input.providerPaymentId,
   apiSecret:input.apiSecret,
   fetchImpl:input.fetchImpl,
  });
  const inspected=inspectPortOneV2CancellationReadbackEvidenceV1({
   paymentId:input.providerPaymentId,
   originalTransactionId:input.originalTransactionId,
   originalVerifiedPaidAmountMinor:input.originalVerifiedPaidAmountMinor,
   originalCurrency:input.originalCurrency,environment:input.environment,
   paymentReadback:raw,
  });
  if(!inspected.shapeConsistent||!inspected.originalPaymentMatched||
     inspected.observedCancelledTotalMinor===null||
     inspected.kind==='inconsistent_or_unrecognized')
   throw unavailable();
  const payment=raw as {cancellations:unknown[]};
  if(payment.cancellations.length>PORTONE_V2_CANCELLATION_SET_GET_V1.maxCancellationItems)
   throw unavailable();
  const successfulItems:PortOneV2CurrentCancelSetItemV1[]=[];
  const seen=new Set<string>();
  let unresolvedItemsObserved=false;
  for(const value of payment.cancellations){
   const item=value as {id:string;status:string;totalAmount:number};
   if(item.status!=='SUCCEEDED'){
    unresolvedItemsObserved=true;
    continue;
   }
   const digest=createHmac('sha256',input.sourceHmacSecret)
    .update(JSON.stringify([
     'portone-cancellation-item-v1',input.providerPaymentId,item.id,
    ]),'utf8').digest('hex');
   const cancellationIdHmac='hmac-sha256:k1:'+digest;
   if(seen.has(cancellationIdHmac))throw unavailable();
   seen.add(cancellationIdHmac);
   successfulItems.push(Object.freeze({
    cancellationIdHmac,exactSucceededAmountMinor:item.totalAmount,
   }));
  }
  return Object.freeze({
   schemaVersion:'portone-v2-cancellation-set-get-v1' as const,
   providerReadbackFromAuthenticatedGet:true as const,
   originalPaymentMatched:true as const,providerShapeConsistent:true as const,
   kind:inspected.kind,
   observedCancelledTotalMinor:inspected.observedCancelledTotalMinor,
   successfulItems:Object.freeze(successfulItems),
   unresolvedItemsObserved,
   providerOrderingProven:false as const,
   legalRefundAuthority:false as const,
   grantRevocationAuthorized:false as const,
   writesPerformed:false as const,
  });
 }catch{
  throw unavailable();
 }
}
