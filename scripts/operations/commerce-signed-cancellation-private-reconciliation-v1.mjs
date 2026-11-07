// Operations-only stitched flow; requires "npm run build" before Node use.
// Signed notification -> verified original Production Reading receipt ->
// HTTPS GET /payments/{paymentId} -> classified review only. No mutations.
import {createHmac} from 'node:crypto';
import {
  reconcileStoredPortOneCancellationSetWithGetPrivateV1,
} from './commerce-portone-cancellation-set-ledger-audit-v1.mjs';
import {
  resolveCancellationOriginalReceiptPrivateV1,
} from './commerce-cancellation-payment-receipt-link-v1.mjs';
import {
  inspectExactCancellationProviderEventReadinessV1,
} from './commerce-cancellation-exact-event-readiness-v1.mjs';

const DISABLED=Object.freeze({
  schemaVersion:'commerce-signed-cancellation-private-reconciliation-v1',
  publicRouteMounted:false,
  entitlementMutationEnabled:false,
  providerCancelPostEnabled:false,
  customerResponseGenerated:false,
});
const base=kind=>Object.freeze({...DISABLED,
  kind,fullRefundExecutionAuthorized:false,
  grantRevocationAuthorized:false,writesPerformed:false});

export const COMMERCE_SIGNED_CANCELLATION_PRIVATE_RECONCILIATION_V1=DISABLED;

/**
 * dbClient must use a complete-visibility operations-only role.
 * Only the authenticated raw webhook and a trusted owned receipt may supply
 * lookup identity. No external API or DB mutation occurs if no exact original
 * paid Reading Receipt is found. Functions may be injected for local tests;
 * real Node operation requires built API modules.
 */
export async function reconcileSignedCancellationPrivateV1({
  dbClient,request,webhookConfig,apiSecret,
  fetchImpl,authenticator,readbackInspector,providerEventReadinessInspector,
  sourceHmacSecret,cancellationSetInspector,
}){
  let authenticate=authenticator;
  let inspect=readbackInspector;
  if(!authenticate){
    ({authenticatePortOneV2CancellationWebhookCandidateV1:authenticate}=
      await import('../../dist/apps/api/src/portone-v2-cancellation-webhook-candidate-v1.js'));
  }
  if(!inspect){
    ({inspectPortOneV2CancellationViaGetCandidateV1:inspect}=
      await import('../../dist/apps/api/src/portone-v2-cancellation-readback-get-v1.js'));
  }
  let signed;
  try{
    signed=authenticate({request,config:webhookConfig});
  }catch{return base('authentication_rejected');}
  if(!signed||signed.kind!=='cancellation_lookup_candidate')
    return base('not_cancellation_event');
  if(webhookConfig?.environment!=='production')return base('production_only_hold');
  // PortOne V2 cancellation notices carry a per-item cancellationId.
  // Without that ID, an aggregate payment GET cannot authenticate the
  // notification's exact cancellation or its success/amount.
  if(typeof signed.providerCancellationId!=='string'||
     signed.providerCancellationId.length===0)
    return base('exact_cancellation_id_required');

  let original;
  try{
    original=await resolveCancellationOriginalReceiptPrivateV1(dbClient,{
      providerPaymentId:signed.providerPaymentId,
      providerTransactionId:signed.providerTransactionId,
    });
  }catch{return base('original_purchase_evidence_unavailable');}
  if(!original)return base('no_verified_original_reading_receipt');

  let classified;
  try{
    classified=await inspect({
      ...original,
      ...(signed.providerCancellationId===null?{}:{
        cancellationId:signed.providerCancellationId,
      }),
      apiSecret,fetchImpl,
    });
  }catch{return base('provider_readback_unavailable');}

  if(classified.providerReadbackFromAuthenticatedGet!==true||
    classified.originalPaymentMatched!==true||
    classified.shapeConsistent!==true||
    classified.refundExecutionAuthorized!==false||
    classified.entitlementRevocationAuthorized!==false)
    return base('inconsistent_provider_readback');

  // A payment-wide CANCELLED/PARTIAL_CANCELLED status is not enough:
  // verify the exact cancellationId from the signed notice against the
  // authenticated GET's individual successful cancellation and bounded sum.
  // Do not infer ordering or refund/revoke authority from this observation.
  const paid=original.originalVerifiedPaidAmountMinor;
  const cumulative=classified.observedCancelledTotalMinor;
  const exact=classified.observedMatchingSucceededCancellationMinor;
  const finalShape=classified.kind==='full_cancel_shape_observed'||
    classified.kind==='partial_cancel_shape_observed';
  if(classified.matchedCancellationIdObserved!==true||
     !Number.isSafeInteger(paid)||paid<=0||
     !Number.isSafeInteger(cumulative)||cumulative<0||cumulative>paid||
     (finalShape&&(
       classified.observedMatchingCancellationStatus!=='SUCCEEDED'||
       !Number.isSafeInteger(exact)||exact<=0||exact>cumulative||
       (signed.eventType==='Transaction.Cancelled'&&
         classified.kind!=='full_cancel_shape_observed')||
       (signed.eventType==='Transaction.PartialCancelled'&&exact>=paid)
     ))||
     (classified.kind==='cancellation_pending'&&
       classified.observedMatchingCancellationStatus!=='REQUESTED'))
    return base('inconsistent_provider_readback');
  const mapping=Object.freeze({
    full_cancel_shape_observed:'full_cancel_review_candidate',
    partial_cancel_shape_observed:'partial_cancel_review_candidate',
    cancellation_pending:'pending_cancel_review_candidate',
    not_cancelled:'no_cancel_observed',
  });
  const kind=mapping[classified.kind];
  if(!kind)return base('inconsistent_provider_readback');
  // The signed webhook and the authenticated PSP GET are not a substitute for
  // a durable, ordered, exactly-reconciled canonical Commerce Provider Event.
  // Run the existing-event audit only after both sources and the original
  // production Receipt have matched; never create events or apply effects here.
  let eventReadiness;
  try {
    const audit=providerEventReadinessInspector??
      inspectExactCancellationProviderEventReadinessV1;
    eventReadiness=await audit(dbClient,{
      providerWebhookId:signed.providerWebhookId,
      originalTransactionId:original.originalTransactionId,
      expectedEventType:signed.eventType,
    });
    if(!eventReadiness||eventReadiness.writesPerformed!==false||
       eventReadiness.grantRevocationAuthorized!==false||
       eventReadiness.providerRefundAuthorized!==false||
       typeof eventReadiness.kind!=='string'||
       typeof eventReadiness.sourceEventReady!=='boolean'||
       typeof eventReadiness.exactPurchaseGrantRevoked!=='boolean')
      return base('canonical_provider_event_audit_inconsistent');
  } catch {
    return base('canonical_provider_event_audit_unavailable');
  }
  // Only an explicitly supplied private fingerprint secret enables a
  // full-set read-only comparison. Never imply current-set completeness from
  // one signed notification, the payment aggregate or a single Event row.
  let cancellationSet;
  if(finalShape&&sourceHmacSecret!==undefined){
    if(typeof sourceHmacSecret!=='string'||
       sourceHmacSecret.length<32||sourceHmacSecret.length>4096||
       sourceHmacSecret.trim()!==sourceHmacSecret||
       /[\u0000-\u001f\u007f]/u.test(sourceHmacSecret))
      return base('source_fingerprint_authority_unavailable');
    try {
      const cancellationIdHmac='hmac-sha256:k1:'+
        createHmac('sha256',sourceHmacSecret)
          .update(JSON.stringify([
            'portone-cancellation-item-v1',
            signed.providerPaymentId,signed.providerCancellationId,
          ]),'utf8').digest('hex');
      const compare=cancellationSetInspector??
        reconcileStoredPortOneCancellationSetWithGetPrivateV1;
      cancellationSet=await compare({
        dbClient,receiptId:original.verifiedReceiptId,
        expectedCancellationIdHmac:cancellationIdHmac,
        sourceHmacSecret,apiSecret,fetchImpl,
      });
      if(!cancellationSet||
         cancellationSet.kind!=='authenticated_current_cancel_set_matches_recorded'||
         cancellationSet.observedProviderSetMatched!==true||
         cancellationSet.postGetDbSnapshotStable!==true||
         cancellationSet.exactSignedCancellationIncluded!==true||
         cancellationSet.providerOrderingProven!==false||
         cancellationSet.grantRevocationAuthorized!==false||
         cancellationSet.providerRefundAuthorized!==false||
         cancellationSet.writesPerformed!==false)
        return base('canonical_cancellation_set_not_verified');
    }catch{return base('canonical_cancellation_set_audit_unavailable');}
  }
  return Object.freeze({...base(kind),
    canonicalCancellationSetMatched:cancellationSet?.observedProviderSetMatched===true,
    canonicalCancellationSetStatus:cancellationSet?.kind??'not_checked',
    exactSignedCancellationIncluded:cancellationSet?.exactSignedCancellationIncluded===true,
    canonicalProviderEventStatus:eventReadiness.kind,
    canonicalProviderEventReady:eventReadiness.sourceEventReady,
    exactEventGrantRevocationObserved:eventReadiness.exactPurchaseGrantRevoked,
    exactProductionReceiptLinked:true,
    providerGetObserved:true,
    originalPaymentMatched:true,
    cancellationStatusShapeConsistent:true,
    fullCancelShapeObserved:classified.fullCancelShapeObserved===true,
    partialCancelShapeObserved:classified.partialCancelShapeObserved===true,
    // Still not verified into canonical Commerce Provider Event ordering or
    // final legal resolution, so NEVER execute an Entitlement Effect here.
    entitlementEffectEligible:false,
  });
}
