import { describe,expect,it } from 'vitest';
import {
  PORTONE_V2_CANCELLATION_READBACK_EVIDENCE_V1,
  inspectPortOneV2CancellationReadbackEvidenceV1 as review,
} from '../apps/api/src/portone-v2-cancellation-readback-evidence-v1.js';

const REF={paymentId:'payment-1',originalTransactionId:'tx-1',
  originalVerifiedPaidAmountMinor:8900,originalCurrency:'KRW',
  environment:'production' as const,cancellationId:'cancel-1'};
const CANCEL={id:'cancel-1',status:'SUCCEEDED',totalAmount:8900};
const PAYMENT={
  status:'CANCELLED',id:'payment-1',transactionId:'tx-1',
  version:'V2',currency:'KRW',channel:{type:'LIVE'},
  amount:{total:8900,paid:8900,cancelled:8900},
  cancellations:[CANCEL],
};
function inspect(override:Record<string,unknown>={},context:Record<string,unknown>={}) {
 return review({...REF,...context,paymentReadback:{...PAYMENT,...override}});
}
describe('PortOne V2 original-receipt-bound cancellation readback SHAPE',()=>{
  it('is explicitly unmounted and never treats parsing as provider authenticity',()=>{
    expect(PORTONE_V2_CANCELLATION_READBACK_EVIDENCE_V1).toEqual({
      productionMounted:false,trustedProviderReadbackBound:false,
      providerGetMounted:false,originalReceiptBindingRequired:true,
      entitlementMutationEnabled:false,cancellationRequestEnabled:false,
    });
  });
  it('recognizes full settled amount and exact succeeded cancellationId, without granting refund/revoke',()=>{
    const r=inspect();
    expect(r).toEqual({
      kind:'full_cancel_shape_observed',
      shapeConsistent:true,originalPaymentMatched:true,
      matchedCancellationIdObserved:true,fullCancelShapeObserved:true,
      partialCancelShapeObserved:false,
      observedCancelledTotalMinor:8900,
      observedMatchingSucceededCancellationMinor:8900,
      observedMatchingCancellationStatus:'SUCCEEDED',
      sourceAuthenticityProven:false,originalReceiptProven:false,
      refundExecutionAuthorized:false,entitlementRevocationAuthorized:false,
    });
    expect(r).not.toHaveProperty('paymentId');
    expect(r).not.toHaveProperty('totalAmount');
    expect(Object.isFrozen(r)).toBe(true);
  });
  it('distinguishes partial amount even for successfully cancelled transaction',()=>{
    const r=inspect({
      status:'PARTIAL_CANCELLED',amount:{paid:8900,cancelled:3000},
      cancellations:[{...CANCEL,totalAmount:3000}],
    });
    expect(r).toMatchObject({kind:'partial_cancel_shape_observed',
      fullCancelShapeObserved:false,partialCancelShapeObserved:true,
      observedCancelledTotalMinor:3000,
      observedMatchingSucceededCancellationMinor:3000,
      observedMatchingCancellationStatus:'SUCCEEDED',
      entitlementRevocationAuthorized:false});
  });
  it('accumulates multiple successful partial cancellations into a full cancellation',()=>{
    const r=inspect({cancellations:[
      {...CANCEL,totalAmount:3000},
      {id:'cancel-2',status:'SUCCEEDED',totalAmount:5900},
    ]});
    expect(r.kind).toBe('full_cancel_shape_observed');
    // One cancellation of 3000 is not a 8900 refund even when all events sum to 8900.
    expect(r.observedCancelledTotalMinor).toBe(8900);
    expect(r.observedMatchingSucceededCancellationMinor).toBe(3000);
    expect(r.observedMatchingCancellationStatus).toBe('SUCCEEDED');
  });
  it('a REQUESTED cancellation never proves finality',()=>{
    const r=inspect({
      status:'PAID',amount:{paid:8900,cancelled:0},
      cancellations:[{...CANCEL,status:'REQUESTED'}],
    });
    expect(r.kind).toBe('cancellation_pending');
    expect(r.observedCancelledTotalMinor).toBe(0);
    expect(r.observedMatchingSucceededCancellationMinor).toBeNull();
    expect(r.observedMatchingCancellationStatus).toBe('REQUESTED');
    expect(r.entitlementRevocationAuthorized).toBe(false);
  });
  it('a FAILED cancellation is not silently labelled completed',()=>{
    const r=inspect({
      status:'PAID',amount:{paid:8900,cancelled:0},
      cancellations:[{...CANCEL,status:'FAILED'}],
    });
    expect(r.kind).toBe('not_cancelled');
    expect(r.observedCancelledTotalMinor).toBe(0);
    expect(r.observedMatchingSucceededCancellationMinor).toBeNull();
    expect(r.observedMatchingCancellationStatus).toBe('FAILED');
    expect(r.fullCancelShapeObserved).toBe(false);
  });
  it('does not identify the signalled cancellationId as succeeded when only a different cancellation succeeded',()=>{
    const r=inspect({
      status:'PARTIAL_CANCELLED',
      amount:{paid:8900,cancelled:3000},
      cancellations:[
        {...CANCEL,status:'REQUESTED'},
        {id:'cancel-2',status:'SUCCEEDED',totalAmount:3000},
      ],
    });
    expect(r.kind).toBe('cancellation_pending');
    expect(r.observedCancelledTotalMinor).toBe(3000);
    expect(r.observedMatchingSucceededCancellationMinor).toBeNull();
    expect(r.observedMatchingCancellationStatus).toBe('REQUESTED');
  });
  it.each([
    [{id:'attacker-payment'}],
    [{transactionId:'attacker-tx'}],
    [{currency:'USD'}],
    [{version:'V1'}],
    [{channel:{type:'TEST'}}],
    [{amount:{paid:8900,cancelled:9000}}],
    [{amount:{paid:8800,cancelled:8800}}],
    [{amount:{paid:8900,cancelled:8900.5}}],
    [{amount:{paid:8900,cancelled:8899}}],
    [{status:'PARTIAL_CANCELLED'}],
    [{status:'PAID'}],
    [{status:'CANCELLED',cancellations:[{...CANCEL,status:'REQUESTED'}]}],
    [{cancellations:[]}],
    [{cancellations:[CANCEL,CANCEL]}],
    [{cancellations:[{...CANCEL,totalAmount:8901}]}],
    [{cancellations:[{...CANCEL,status:'FUTURE_STATUS'}]}],
    [{cancellations:[{...CANCEL,totalAmount:'8900'}]}],
    [{cancellations:[{...CANCEL,id:'c\na'}]}],
    [{status:'UNKNOWN_NEW_PAYMENT_STATE'}],
  ] as const)('fails closed on inconsistent PortOne payload %j',(changes)=>{
    const r=inspect(changes);
    expect(r.kind).toBe('inconsistent_or_unrecognized');
    expect(r.shapeConsistent).toBe(false);
    expect(r.observedCancelledTotalMinor).toBeNull();
    expect(r.observedMatchingSucceededCancellationMinor).toBeNull();
    expect(r.observedMatchingCancellationStatus).toBeNull();
    expect(r.entitlementRevocationAuthorized).toBe(false);
  });
  it.each([
    [{originalTransactionId:'other-tx'}],
    [{originalVerifiedPaidAmountMinor:9999}],
    [{originalCurrency:'USD'}],
    [{environment:'sandbox'}],
    [{cancellationId:'other-cancellation'}],
  ] as const)('rejects bad original receipt / cancellation provenance %j',(context)=>{
    expect(inspect({},context).kind).toBe('inconsistent_or_unrecognized');
  });
  it('recognizes sandbox only when the expected environment and channel agree',()=>{
    expect(inspect({channel:{type:'TEST'}},{environment:'sandbox'})
      .kind).toBe('full_cancel_shape_observed');
  });
  it('never treats an unverified or missing original cancellation identity as full settlement',()=>{
    const r=inspect({
      status:'CANCELLED',
      cancellations:[{...CANCEL,id:'cancel-from-other-payment'}],
    });
    expect(r.kind).toBe('inconsistent_or_unrecognized');
  });
});
