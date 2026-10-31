// Operations-only stitched flow; requires "npm run build" before Node use.
// Signed notification -> verified original Production Reading receipt ->
// HTTPS GET /payments/{paymentId} -> classified review only. No mutations.
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
  return Object.freeze({...base(kind),
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
