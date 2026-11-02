/**
 * PortOne V2 cancellation readback SHAPE verifier, not a payment verifier.
 *
 * Expects a GET /payments/{paymentId} response returned by a trusted internal
 * server-side read-only provider adapter. Because input is an offline object,
 * its source authenticity is NOT established here. The production route,
 * provider GET adapter, refund executor and Grant revocation remain unmounted.
 *
 * PortOne V2 schema: PaymentAmount.paid/cancelled; Payment.cancellations[]
 * with status REQUESTED | SUCCEEDED | FAILED and totalAmount on each row.
 */
export const PORTONE_V2_CANCELLATION_READBACK_EVIDENCE_V1 = Object.freeze({
  productionMounted: false,
  trustedProviderReadbackBound: false,
  providerGetMounted: false,
  originalReceiptBindingRequired: true,
  entitlementMutationEnabled: false,
  cancellationRequestEnabled: false,
} as const);

type ReadbackClassificationV1 =
  | 'full_cancel_shape_observed'
  | 'partial_cancel_shape_observed'
  | 'cancellation_pending'
  | 'not_cancelled'
  | 'inconsistent_or_unrecognized';

export interface PortOneV2CancellationReadbackReviewV1 {
  readonly kind: ReadbackClassificationV1;
  readonly shapeConsistent: boolean;
  readonly originalPaymentMatched: boolean;
  readonly matchedCancellationIdObserved: boolean;
  readonly fullCancelShapeObserved: boolean;
  readonly partialCancelShapeObserved: boolean;
  // Parsed response-shape amounts only, NOT authenticated payment evidence.
  readonly observedCancelledTotalMinor: number | null;
  readonly observedMatchingSucceededCancellationMinor: number | null;
  readonly observedMatchingCancellationStatus: 'SUCCEEDED'|'REQUESTED'|'FAILED'|null;
  readonly sourceAuthenticityProven: false;
  readonly originalReceiptProven: false;
  readonly refundExecutionAuthorized: false;
  readonly entitlementRevocationAuthorized: false;
}

const IDENTIFIER=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const CURRENCY=/^[A-Z]{3}$/u;
function id(value: unknown): value is string {
  return typeof value==='string'&&IDENTIFIER.test(value)&&value.trim()===value;
}
function record(value: unknown): Record<string, unknown> | null {
  if (typeof value!=='object'||value===null||Array.isArray(value))return null;
  return value as Record<string,unknown>;
}
function minor(v: unknown): v is number {
  return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
}
function result(
  kind:ReadbackClassificationV1,
  matchedCancellationIdObserved=false,
  observedCancelledTotalMinor:number|null=null,
  observedMatchingSucceededCancellationMinor:number|null=null,
  observedMatchingCancellationStatus:'SUCCEEDED'|'REQUESTED'|'FAILED'|null=null,
):PortOneV2CancellationReadbackReviewV1 {
  return Object.freeze({
    kind,shapeConsistent:kind!=='inconsistent_or_unrecognized',
    originalPaymentMatched:kind!=='inconsistent_or_unrecognized',
    matchedCancellationIdObserved,
    fullCancelShapeObserved:kind==='full_cancel_shape_observed',
    partialCancelShapeObserved:kind==='partial_cancel_shape_observed',
    observedCancelledTotalMinor,observedMatchingSucceededCancellationMinor,
    observedMatchingCancellationStatus,
    sourceAuthenticityProven:false,originalReceiptProven:false,
    refundExecutionAuthorized:false,entitlementRevocationAuthorized:false,
  });
}
const INCONSISTENT=result('inconsistent_or_unrecognized');

export function inspectPortOneV2CancellationReadbackEvidenceV1(input:Readonly<{
  paymentId: string;
  originalTransactionId: string;
  originalVerifiedPaidAmountMinor: number;
  originalCurrency: string;
  environment: 'production' | 'sandbox';
  cancellationId?: string | undefined;
  paymentReadback: unknown;
}>):PortOneV2CancellationReadbackReviewV1 {
  if(!id(input.paymentId)||!id(input.originalTransactionId)||
     !minor(input.originalVerifiedPaidAmountMinor)||
     input.originalVerifiedPaidAmountMinor===0||
     typeof input.originalCurrency!=='string'||
     !CURRENCY.test(input.originalCurrency)||
     !['production','sandbox'].includes(input.environment)||
     (input.cancellationId!==undefined&&!id(input.cancellationId)))
    return INCONSISTENT;
  const payment=record(input.paymentReadback);
  const amount=record(payment?.amount);
  const channel=record(payment?.channel);
  if(payment===null||amount===null||channel===null||
     payment.version!=='V2'||
     payment.id!==input.paymentId||
     payment.transactionId!==input.originalTransactionId||
     payment.currency!==input.originalCurrency||
     channel.type!==(input.environment==='production'?'LIVE':'TEST')||
     !minor(amount.paid)||
     amount.paid!==input.originalVerifiedPaidAmountMinor||
     !minor(amount.cancelled)||amount.cancelled>amount.paid||
     !Array.isArray(payment.cancellations)||
     payment.cancellations.length>64)return INCONSISTENT;

  const allowed=['PAID','PARTIAL_CANCELLED','CANCELLED'];
  if(!allowed.includes(payment.status as string))return INCONSISTENT;

  let succeededTotal=0;
  let requested=false;
  const seen=new Set<string>();
  let matchingCancellationId=false;
  let matchedCancellationStatus:'SUCCEEDED'|'REQUESTED'|'FAILED'|undefined;
  let matchedSucceededAmount:number|null=null;
  for(const cancellationValue of payment.cancellations) {
    const c=record(cancellationValue);
    if(c===null||!id(c.id)||seen.has(c.id)||!minor(c.totalAmount)||
       c.totalAmount===0||
       !['SUCCEEDED','REQUESTED','FAILED'].includes(c.status as string))
      return INCONSISTENT;
    seen.add(c.id);
    if(c.id===input.cancellationId){
      matchingCancellationId=true;
      matchedCancellationStatus=c.status as 'SUCCEEDED'|'REQUESTED'|'FAILED';
      matchedSucceededAmount=c.status==='SUCCEEDED'?c.totalAmount as number:null;
    }
    if(c.status==='REQUESTED')requested=true;
    if(c.status==='SUCCEEDED') {
      succeededTotal+=c.totalAmount;
      if(!Number.isSafeInteger(succeededTotal)||succeededTotal>amount.paid)
        return INCONSISTENT;
    }
  }
  if(succeededTotal!==amount.cancelled)return INCONSISTENT;
  if(input.cancellationId!==undefined&&!matchingCancellationId)
    return INCONSISTENT;

  // A webhook requesting cancellation can be superseded or fail. Never
  // announce settlement for its cancellation ID unless that exact ID SUCCEEDED.
  if(input.cancellationId!==undefined&&matchedCancellationStatus!=='SUCCEEDED') {
    if(matchedCancellationStatus==='REQUESTED')
      return result('cancellation_pending',true,amount.cancelled as number,null,'REQUESTED');
    return result('not_cancelled',true,amount.cancelled as number,null,'FAILED');
  }

  if(payment.status==='CANCELLED') {
    if(amount.cancelled!==amount.paid||succeededTotal===0||requested)
      return INCONSISTENT;
    return result('full_cancel_shape_observed',matchingCancellationId,
      amount.cancelled as number,matchedSucceededAmount,matchedCancellationStatus??null);
  }
  if(payment.status==='PARTIAL_CANCELLED') {
    if(amount.cancelled===0||amount.cancelled>=amount.paid)return INCONSISTENT;
    return result('partial_cancel_shape_observed',matchingCancellationId,
      amount.cancelled as number,matchedSucceededAmount,matchedCancellationStatus??null);
  }
  if(amount.cancelled!==0)return INCONSISTENT;
  return result(requested?'cancellation_pending':'not_cancelled',matchingCancellationId,
    amount.cancelled as number,matchedSucceededAmount,matchedCancellationStatus??null);
}
